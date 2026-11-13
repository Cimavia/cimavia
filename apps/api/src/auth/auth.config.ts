import { expo } from "@better-auth/expo";
import {
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  Locale,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_TOKEN_TTL_SECONDS,
  Role,
  VERIFY_EMAIL_PASSWORD_REQUIRED,
} from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { personaOf } from "./persona";

/**
 * Envoi d'un lien à usage unique — réinitialisation, vérification d'adresse. Un callback plutôt
 * qu'un service injecté : ce fichier est une fabrique PURE, appelée par `app.module.ts` — lui donner un `MailService` y ferait entrer la DI
 * Nest et l'infra SMTP, dans le seul fichier qui décrit la politique d'authentification.
 *
 * `locale` est typé `string | null` et non `Locale` : c'est un `String` en base, pas un enum
 * Prisma. Le catalogue de mails replie sur le français ; on ne ment pas ici sur ce qu'on sait.
 */
export type SendAuthLink = (params: {
  to: string;
  locale: string | null;
  url: string;
}) => Promise<void>;

export type AuthConfig = {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  /**
   * L'en-tête qui porte l'IP du client (`clientIpHeaderOf`, #781) — `null` en local, où il n'y a
   * pas de proxy. Une clé obligatoire, même nulle : l'oublier dans `app.module.ts` remettrait le
   * défaut de Better Auth sans qu'aucun test ne le voie.
   */
  clientIpHeader: string | null;
  sendResetPassword: SendAuthLink;
  /** Le lien qui prouve que l'inscrit possède son adresse (#270). */
  sendVerificationEmail: SendAuthLink;
  /**
   * L'avis au propriétaire d'une adresse déjà inscrite, quand quelqu'un tente de s'inscrire avec
   * (#270). L'inscription lui répond comme à une adresse neuve : c'est le seul endroit où
   * l'information arrive, et elle n'arrive qu'à qui possède l'adresse.
   *
   * `verified: false` — le compte n'avait jamais été confirmé, et son mot de passe vient d'être
   * effacé : l'avis doit mener au choix d'un mot de passe, pas à la connexion.
   */
  notifyExistingAccount: (params: {
    to: string;
    locale: string | null;
    verified: boolean;
  }) => Promise<void>;
  /**
   * L'environnement accepte-t-il de créer un compte pour cette adresse (#263) ?
   *
   * Un callback, pour la même raison que `sendResetPassword` : la réponse demande la base (une
   * invitation nominative en cours) et la configuration, et ce fichier est une fabrique PURE.
   * `SignupPolicy` porte la décision, celle-ci ne fait qu'en appliquer le verdict.
   */
  mayCreateAccount: (email: string, account: { isCompany: boolean }) => Promise<boolean>;
};

/**
 * `locale` est déclaré en `additionalFields`, donc bien présent sur l'objet rendu par l'adapter —
 * mais le type `User` de Better Auth ne le porte pas. On le lit par une garde plutôt que par un
 * `as` : si le champ disparaissait des `additionalFields`, on repartirait en français au lieu de
 * planter à l'exécution sur une propriété inventée.
 */
function localeOf(user: unknown): string | null {
  if (typeof user !== "object" || user == null || !("locale" in user)) {
    return null;
  }
  return typeof user.locale === "string" ? user.locale : null;
}

/**
 * Écrits par `PATCH /me/capabilities` seul — `role` en découle, il ne se pose jamais. `isCompany`
 * n'y est même pas écrit : un compte ne devient ni ne cesse d'être une entreprise (#600).
 */
const CAPABILITY_FIELDS = ["isCoach", "isAthlete", "isCompany", "role"] as const;

/**
 * Un drapeau de capacité lu sur l'utilisateur que passe Better Auth, `false` s'il manque. Même
 * raison que `localeOf` : déclarés en `additionalFields`, ils sont bien là, mais le type `User` de
 * la bibliothèque ne les porte pas.
 */
function flagOf(user: unknown, field: "isCoach" | "isAthlete" | "isCompany"): boolean {
  if (typeof user !== "object" || user == null || !(field in user)) return false;
  return (user as Record<string, unknown>)[field] === true;
}

type Capabilities = { isCoach: boolean; isAthlete: boolean; isCompany: boolean };

function requestedCapabilities(user: unknown): Capabilities {
  return {
    isCoach: flagOf(user, "isCoach"),
    isAthlete: flagOf(user, "isAthlete"),
    isCompany: flagOf(user, "isCompany"),
  };
}

/**
 * Refuse une combinaison de capacités qu'aucun compte ne peut porter, en 400.
 *
 * - L'entreprise est un TYPE de compte, pas une case de plus (#600) : elle ne coache ni ne
 *   s'entraîne. Refusée ici plutôt qu'au CHECK `user_company_exclusive`, qui répondrait 500.
 * - Au moins une capacité : un compte sans aucune ne pourrait RIEN faire, et le fail closed de
 *   `capabilitiesOf` le laisserait devant une application vide sans lui dire pourquoi.
 */
function assertCapabilities({ isCoach, isAthlete, isCompany }: Capabilities): void {
  if (isCompany && (isCoach || isAthlete)) {
    throw new APIError("BAD_REQUEST", {
      message: "un compte Entreprise ne coache ni ne s'entraîne",
    });
  }
  if (!isCompany && !isCoach && !isAthlete) {
    throw new APIError("BAD_REQUEST", {
      message: "un type de compte requis : coach, athlète ou entreprise",
    });
  }
}

/** La seule route qui crée un compte : l'e-mail et le mot de passe sont le seul moyen activé. */
const SIGN_UP_PATH = "/sign-up/email";

/**
 * La porte d'un environnement fermé (#263), posée AVANT la route d'inscription.
 *
 * Elle vivait seule dans `databaseHooks.user.create.before`, et c'est la vérification d'adresse
 * (#270) qui l'a fait passer devant : avec `requireEmailVerification`, Better Auth convertit tout
 * 403 levé pendant la création du compte en SUCCÈS générique — sa réponse anti-énumération au
 * doublon d'adresse. Le refus d'un environnement fermé serait parti en « vérifie ta boîte », sans
 * compte créé ni e-mail envoyé. Un hook `before` lève hors de la route : son 403 atteint le client
 * tel quel. `create.before` la repose (`assertMayCreate`) pour les autres chemins de création.
 *
 * Le corps n'est pas encore validé par la route à ce stade. Une adresse qui n'est pas une chaîne
 * est refusée ici plutôt que laissée à la route : la porte ne s'ouvre pas sur ce qu'elle ne sait
 * pas lire.
 *
 * Les capacités sont refusées ici aussi, et pas seulement à la création : Better Auth cherche
 * l'adresse AVANT de créer le compte, et une adresse déjà inscrite ne va jamais jusqu'à
 * `create.before`. Un corps sans capacité répondrait alors 400 pour une adresse neuve et 200 pour
 * une adresse prise — de quoi deviner, une à une, quelles adresses ont un compte.
 */
function signUpGate(mayCreateAccount: AuthConfig["mayCreateAccount"]) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_UP_PATH) return;
    const body: unknown = ctx.body;
    const email =
      typeof body === "object" && body != null && "email" in body ? body.email : undefined;
    if (typeof email !== "string") {
      throw new APIError("BAD_REQUEST", { message: "adresse e-mail requise" });
    }
    await assertMayCreate(mayCreateAccount, email, requestedCapabilities(body));
  });
}

/**
 * Les deux refus d'une création de compte : l'environnement (403), puis les capacités (400).
 *
 * Appelés avant la route d'inscription (`signUpGate`) ET à la création (`create.before`) : le
 * premier pour que la réponse ne dépende pas de l'existence de l'adresse, le second pour que
 * l'invariant de #263 — aucun compte sans invitation ni liste sur un environnement fermé — tienne
 * aussi pour un chemin de création qu'ouvrirait un jour un plugin.
 */
async function assertMayCreate(
  mayCreateAccount: AuthConfig["mayCreateAccount"],
  email: string,
  capabilities: Capabilities,
): Promise<void> {
  // La porte dépend du type de compte demandé : une invitation n'ouvre jamais une entreprise (#601).
  if (!(await mayCreateAccount(email, { isCompany: capabilities.isCompany }))) {
    // 403 et non 400 — la demande n'a rien de fautif, c'est l'environnement qui refuse ; les deux
    // clients s'appuient sur ce code pour dire « passe par ton coach » plutôt que « corrige ta
    // saisie ».
    throw new APIError("FORBIDDEN", { message: "inscription fermée sur cet environnement" });
  }
  assertCapabilities(capabilities);
}

/**
 * Le refus d'un lien de vérification ouvert sur un compte SANS mot de passe (#270), en redirection
 * vers la page de retour avec `?error=PASSWORD_REQUIRED` — comme Better Auth le fait pour un jeton
 * expiré. Le `callbackURL` est déjà passé par la vérification d'origine de la route : rediriger
 * vers lui n'ouvre rien. Sans lui, un 403 nommé.
 */
function passwordRequired(request: Request | undefined, baseURL: string): APIError {
  const callbackURL = request == null ? null : new URL(request.url).searchParams.get("callbackURL");
  if (!callbackURL) {
    return APIError.from("FORBIDDEN", {
      code: VERIFY_EMAIL_PASSWORD_REQUIRED,
      message: "ce compte n'a pas de mot de passe : passer par « mot de passe oublié »",
    });
  }
  const target = new URL(callbackURL, baseURL);
  target.searchParams.set("error", VERIFY_EMAIL_PASSWORD_REQUIRED);
  return new APIError("FOUND", undefined, new Headers({ location: target.toString() }));
}

/**
 * Où Better Auth lit l'IP du client (#781) : elle sépare les compteurs de sa limite de débit — 3
 * tentatives par 10 s sur `/sign-in` et `/sign-up`, active en production — et il l'inscrit sur la
 * session. Sans en-tête, son défaut (`x-forwarded-for`) : pourquoi il ne tient pas derrière un
 * proxy, voir `CLIENT_IP_HEADER` dans `envSchema`.
 */
function clientIpOptions(header: string | null) {
  return header === null ? undefined : { ipAddressHeaders: [header] };
}

/**
 * Instance Better Auth branchée sur le PrismaClient **unique** de l'app (adapter Prisma).
 * Le profil (capacités, role, locale) vit sur `user` via additionalFields — validés côté app :
 * `role` ∈ Role, `locale` ∈ Locale. ADMIN n'est pas auto-assignable à l'inscription.
 *
 * Les capacités y sont déclarées, et ce n'est pas cosmétique : Better Auth ne renvoie dans
 * `session.user` que les champs DÉCLARÉS. Des colonnes Prisma seules ne remonteraient jamais
 * jusqu'à `authClient.useSession()`, et `capabilitiesOf()` rendrait « aucune capacité » à tout
 * le monde — nav vide sur les deux plateformes, sans qu'aucune porte qualité ne le voie (#9).
 */
export function createAuth(prisma: PrismaClient, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [
      ...config.trustedOrigins,
      // Origines supplémentaires : IP réseau locale, tunnel ngrok/Expo…
      // Configurer via BETTER_AUTH_TRUSTED_ORIGINS (valeurs séparées par virgule)
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
    ],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    advanced: { ipAddress: clientIpOptions(config.clientIpHeader) },
    // Le modèle Prisma de session auth est renommé `AuthSession` pour libérer le nom `Session`
    // au profit de l'entité métier séance (P2). La table reste `session` (via @@map) — pas de
    // migration de données. Better Auth résout le délégué Prisma via ce `modelName`.
    session: { modelName: "authSession" },
    // Plugin serveur Expo : gère l'origine (scheme cimavia://) et les cookies natifs du client mobile.
    plugins: [expo()],
    hooks: { before: signUpGate(config.mayCreateAccount) },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Posée explicitement bien qu'elle vaille le défaut de la bibliothèque : c'est cette durée
      // que l'e-mail annonce. Laissée implicite, une mise à jour de Better Auth la changerait sans
      // toucher au texte, et le message mentirait sans qu'aucun test ne le voie.
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_TTL_SECONDS,
      sendResetPassword: async ({ user, url }) => {
        await config.sendResetPassword({ to: user.email, locale: localeOf(user), url });
      },
      /**
       * Pas de session sans adresse vérifiée (#270). L'adresse est le verrou des invitations
       * nominatives (#146, #390) et de la porte d'un environnement fermé (#263) : sans cette
       * preuve, qui connaissait l'adresse d'un invité pouvait s'inscrire à sa place et accepter.
       *
       * La connexion entière, et non les seules routes qui lisent l'adresse : six routes le font
       * déjà (invitations d'Athlete et d'entreprise), et une septième n'aurait rien eu pour se
       * souvenir qu'il fallait la garder.
       *
       * Effet de bord voulu de la bibliothèque : l'inscription sur une adresse déjà prise répond
       * comme une inscription neuve, plus de 422. C'est ce qui empêche de deviner quelles adresses
       * ont un compte — et ce qui oblige la porte d'inscription à lever AVANT la route
       * (`signUpGate`), sans quoi son 403 serait lui aussi changé en succès.
       */
      requireEmailVerification: true,
      /**
       * Une inscription sur une adresse déjà prise. Confirmée, le compte ne bouge pas.
       *
       * Jamais confirmée, son mot de passe est EFFACÉ. Rien ne prouve que celui qui l'a choisi
       * possède l'adresse, et le lien de confirmation ne porte que l'adresse : le vrai propriétaire
       * qui l'ouvrirait — après avoir tenté de s'inscrire, il en attend un — confirmerait le compte
       * d'un autre, dont le mot de passe resterait bon. Effacé, il ne reste rien à personne : le
       * propriétaire en choisit un par « mot de passe oublié », qui passe par sa boîte et confirme
       * l'adresse (`onPasswordReset`). Le prix : celui qui avait seulement oublié son inscription
       * choisit lui aussi un mot de passe — l'avis qu'il reçoit le lui dit.
       *
       * La réponse HTTP, elle, ne change pas : toujours celle d'une adresse neuve.
       */
      onExistingUserSignUp: async ({ user }) => {
        if (!user.emailVerified) {
          await prisma.account.deleteMany({ where: { userId: user.id, providerId: "credential" } });
        }
        await config.notifyExistingAccount({
          to: user.email,
          locale: localeOf(user),
          verified: user.emailVerified,
        });
      },
      /**
       * Le lien de réinitialisation est arrivé dans la boîte de l'adresse : il la prouve aussi
       * sûrement que celui de la confirmation. C'est ce qui rend utile l'avis au propriétaire d'un
       * compte jamais confirmé — un seul geste, et il peut se connecter.
       */
      onPasswordReset: async ({ user }) => {
        if (user.emailVerified) return;
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      },
    },
    emailVerification: {
      // Le lien part à l'inscription (le défaut quand la vérification est requise) et repart à
      // chaque connexion refusée faute de vérification. Les écrans « vérifie ta boîte » passent,
      // eux, par `/send-verification-email`, publique : elle n'écrit qu'à l'adresse même, avec un
      // délai plancher qui ne trahit pas son existence, et Better Auth la limite comme la
      // demande de réinitialisation.
      //
      // ⚠️ Le jeton ne porte que l'adresse : un lien ouvert confirme le compte qui la détient, quel
      // que soit celui qui en a choisi le mot de passe. L'effacement ci-dessus couvre le cas où le
      // propriétaire s'inscrit à son tour ; un tiers qui a pris l'adresse sans être contesté peut
      // faire partir ce lien, et le gagne si le propriétaire l'ouvre sans l'avoir demandé (dette
      // AV-1, cas 1). L'e-mail dit d'ignorer un lien non sollicité : c'est la seule parade.
      sendOnSignUp: true,
      sendOnSignIn: true,
      // Pas de session ouverte par le lien : il s'ouvre souvent sur un autre appareil que celui de
      // l'inscription — l'ordinateur pour un compte créé sur le téléphone. La page d'arrivée dit
      // « connecte-toi », et vaut pour les deux.
      autoSignInAfterVerification: false,
      // Posée pour la même raison que `resetPasswordTokenExpiresIn` : c'est la durée que l'e-mail
      // annonce.
      expiresIn: EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await config.sendVerificationEmail({ to: user.email, locale: localeOf(user), url });
      },
      /**
       * Un lien ouvert sur un compte dont le mot de passe a été effacé (`onExistingUserSignUp`) :
       * un lien parti avant l'effacement, ou un renvoi demandé depuis « vérifie ta boîte ».
       * Confirmer l'adresse puis dire « connecte-toi » mènerait à un « identifiants incorrects »
       * sans issue. Rien n'est écrit : la page de retour dit de choisir un mot de passe, et la
       * réinitialisation confirmera l'adresse (`onPasswordReset`).
       */
      beforeEmailVerification: async (user, request) => {
        const credential = await prisma.account.findFirst({
          where: { userId: user.id, providerId: "credential" },
          select: { id: true },
        });
        if (credential == null) throw passwordRequired(request, config.baseURL);
      },
    },
    user: {
      additionalFields: {
        /**
         * Capacités CUMULABLES (#9) : ce qui fonde un droit, à la place de `role`.
         *
         * `input: true` depuis #12 : ce sont désormais ELLES que le signup envoie (deux cases à
         * cocher), et `role` qui s'en déduit. Le sens de dérivation s'est inversé — voir
         * databaseHooks.
         */
        isCoach: { type: "boolean", required: false, input: true, defaultValue: false },
        isAthlete: { type: "boolean", required: false, input: true, defaultValue: false },
        /**
         * Le compte Entreprise (#600) : choisi en premier à l'inscription, EXCLUSIF des deux
         * ci-dessus — `create.before` refuse le cumul, le CHECK `user_company_exclusive` aussi.
         */
        isCompany: { type: "boolean", required: false, input: true, defaultValue: false },
        /**
         * Persona d'AFFICHAGE seul depuis #9 : sur quel univers atterrit un compte à double
         * capacité. Ne fonde aucun droit — `capabilitiesOf()` ne le lit plus.
         *
         * `required: false` depuis #12 : le client ne l'envoie plus, il est DÉDUIT des capacités.
         * Le laisser en entrée aurait rouvert la porte qu'on vient de fermer — un client pouvant
         * poser un persona incohérent avec ses capacités.
         */
        role: { type: "string", required: false, input: false, defaultValue: Role.COACH },
        locale: {
          type: "string",
          required: false,
          input: true,
          defaultValue: Locale.FR,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const capabilities = requestedCapabilities(user);
            // Déjà vérifié avant la route d'inscription (`signUpGate`) ; reposé ici pour tout autre
            // chemin de création. Sur l'inscription, un refus levé ICI serait changé en succès
            // générique par Better Auth (#270) — c'est pourquoi il n'y est pas le premier.
            await assertMayCreate(config.mayCreateAccount, user.email, capabilities);
            // `role` est DÉDUIT, jamais reçu (#12) : il ne dit plus ce qu'on a le droit de faire,
            // seulement où l'on atterrit.
            return { data: { ...user, ...capabilities, role: personaOf(capabilities) } };
          },
          /**
           * L'entreprise qu'ouvre un compte Entreprise (#600), du même id.
           *
           * APRÈS la création et non avant : la ligne `organization` pointe sur le compte, qui doit
           * exister. Better Auth n'enveloppe pas ce hook dans la transaction de l'inscription — le
           * prisma-adapter n'en ouvre aucune par défaut. D'où les deux précautions :
           * - un upsert, et non un create : rejoué, il ne casse rien ;
           * - en cas d'échec, le compte tout juste créé est SUPPRIMÉ avant de rendre l'erreur. Sans
           *   ça, l'inscription échouait en laissant un compte Entreprise sans entreprise, que la
           *   personne ne pouvait plus recréer — une nouvelle inscription sur l'adresse ne fait que
           *   prévenir son propriétaire (#270) — et auquel #601 n'aurait jamais pu ajouter de
           *   Coach. Le hook passe avant la création des identifiants et de la
           *   session : supprimer le compte suffit à tout défaire.
           */
          after: async (user) => {
            if (!flagOf(user, "isCompany")) return;
            try {
              await prisma.organization.upsert({
                where: { id: user.id },
                create: { id: user.id },
                update: {},
              });
            } catch (cause) {
              // Si la suppression échoue à son tour, c'est l'échec d'origine qui part : c'est lui
              // qui dit pourquoi l'inscription n'a pas abouti.
              await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
              throw cause;
            }
          },
        },
        update: {
          // Sans `async` : rien n'y est attendu. Better Auth exige une promesse en retour — le refus,
          // lui, part par `throw`, que le `await` de l'appelant reçoit comme un rejet.
          before: (user) => {
            // `input: true` ouvre les capacités à l'inscription ET à `/update-user`, qui les
            // écrirait sans `assertRemovable` ni recalcul de `role` (#310). Ce hook ne voit pas
            // `CapabilityService` : il écrit par Prisma, hors de l'adapter Better Auth.
            const locked = CAPABILITY_FIELDS.filter((field) => field in user);
            if (locked.length > 0) {
              throw APIError.from("BAD_REQUEST", {
                // Le code que Better Auth rend déjà pour un champ `input: false` : même refus,
                // même réponse, que le champ soit fermé par la déclaration ou par ce hook.
                code: "FIELD_NOT_ALLOWED",
                message: `non modifiable par /update-user : ${locked.join(", ")} — passer par PATCH /me/capabilities`,
              });
            }
            return Promise.resolve();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

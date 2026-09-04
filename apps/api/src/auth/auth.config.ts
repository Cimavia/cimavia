import { expo } from "@better-auth/expo";
import {
  Locale,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_TOKEN_TTL_SECONDS,
  Role,
} from "@cmv/shared";
import type { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";

/**
 * Envoi du lien de réinitialisation. Un callback plutôt qu'un service injecté : ce fichier est une
 * fabrique PURE, appelée par `app.module.ts` — lui donner un `MailService` y ferait entrer la DI
 * Nest et l'infra SMTP, dans le seul fichier qui décrit la politique d'authentification.
 *
 * `locale` est typé `string | null` et non `Locale` : c'est un `String` en base, pas un enum
 * Prisma. Le catalogue de mails replie sur le français ; on ne ment pas ici sur ce qu'on sait.
 */
export type SendResetPassword = (params: {
  to: string;
  locale: string | null;
  url: string;
}) => Promise<void>;

export type AuthConfig = {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  sendResetPassword: SendResetPassword;
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
    // Le modèle Prisma de session auth est renommé `AuthSession` pour libérer le nom `Session`
    // au profit de l'entité métier séance (P2). La table reste `session` (via @@map) — pas de
    // migration de données. Better Auth résout le délégué Prisma via ce `modelName`.
    session: { modelName: "authSession" },
    // Plugin serveur Expo : gère l'origine (scheme cimavia://) et les cookies natifs du client mobile.
    plugins: [expo()],
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
            const { isCoach = false, isAthlete = false } = user as {
              isCoach?: boolean;
              isAthlete?: boolean;
            };
            // Au moins une capacité : un compte sans aucune ne pourrait RIEN faire, et le fail
            // closed de `capabilitiesOf` le laisserait devant une application vide sans lui dire
            // pourquoi. Le refus est ici, à la création, plutôt qu'à chaque écran.
            if (!isCoach && !isAthlete) {
              throw new APIError("BAD_REQUEST", {
                message: "au moins une capacité requise : coach ou athlète",
              });
            }
            // `role` est DÉDUIT, jamais reçu (#12) : il ne dit plus ce qu'on a le droit de faire,
            // seulement où l'on atterrit. Coach l'emporte quand les deux sont cochées — c'est
            // l'univers où l'on crée, et le cas qui a motivé #7 est un coach qui se coache
            // lui-même. Le choix explicite viendra avec les deux sections de nav (#129).
            const role = isCoach ? Role.COACH : Role.ATHLETE;
            return { data: { ...user, isCoach, isAthlete, role } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

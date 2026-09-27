import { z } from "zod";
import { SIGNUP_MODES } from "./util/signup.util";

// Une variable d'env optionnelle vide ("") est traitée comme absente, pas comme
// une valeur invalide : .env / .env.example contiennent des placeholders vides
// pour les services pas encore configurés (Sentry, Axiom…).
const emptyAsUndefined = (v: unknown) => (v === "" ? undefined : v);

/**
 * Longueur minimale d'un secret de signature ou d'un secret partagé (#357). Better Auth se
 * contente d'AVERTIR en dessous de 32 caractères : un secret d'un caractère démarrait, et signait
 * les sessions avec une clé HMAC triviale. `openssl rand -base64 32`, la commande des `.env.example`,
 * en produit 44.
 */
export const SECRET_MIN_LENGTH = 32;
const SECRET_TOO_SHORT = `au moins ${SECRET_MIN_LENGTH} caractères — générer : openssl rand -base64 32`;

/**
 * Les tiers qui portent de vraies données et sont joignables publiquement : le NAS (`preview`,
 * depuis #260) et la production. C'est là que l'API refuse de démarrer mal configurée — le
 * développement local, lui, reste permissif (#357).
 */
const DEPLOYED_TIERS = ["preview", "production"] as const;

const envShape = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /**
   * Version du produit (`1.2.0`) et identité du build (le sha court), INJECTÉES AU BUILD de
   * l'image (#186) — jamais posées dans le `.env` du NAS, qui en ferait une seconde source de
   * vérité, modifiable à côté de l'artefact et donc capable de mentir sur ce qui tourne.
   *
   * Les deux sont OPTIONNELLES : un `pnpm dev` local n'en a aucune, et l'API doit démarrer pareil.
   * Absentes, ce qui les lit répond `null` — jamais un numéro inventé (règle dure n°5).
   *
   * Deux variables et non une chaîne pré-assemblée : l'affichage et Swagger veulent le numéro nu,
   * Sentry veut l'identité complète `1.2.0+3f2a1c`. Les coller ici priverait les premiers du leur.
   */
  APP_VERSION: z.preprocess(emptyAsUndefined, z.string().optional()),
  APP_BUILD: z.preprocess(emptyAsUndefined, z.string().optional()),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  // Better Auth : secret de signature (obligatoire, 32 caractères au moins partout — #357) + URL
  // publique de l'API (base des liens), en https sur un tier déployé : voir le `superRefine`.
  BETTER_AUTH_SECRET: z.string().min(SECRET_MIN_LENGTH, SECRET_TOO_SHORT),
  BETTER_AUTH_URL: z.url(),
  // Origines supplémentaires de confiance pour Better Auth (IP LAN, tunnel ngrok/Expo…)
  // Format : "http://192.168.1.10:3000,https://abcd.ngrok.io"
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  // Origines navigateur autorisées (CORS + trustedOrigins), séparées par des virgules.
  // Ex. : "http://localhost:5173". Le scheme mobile (cimavia://) est ajouté côté code.
  CORS_ORIGINS: z.preprocess(emptyAsUndefined, z.string().optional()),
  /**
   * Qui a le droit de créer un compte (#263).
   *
   * `open` : n'importe qui, c'est le comportement de la production. `invitation` : uniquement une
   * adresse déjà invitée nominativement, ou listée dans `SIGNUP_ALLOWED_EMAILS` — c'est preview,
   * dont l'URL n'a rien de secret (elle est figée dans l'APK et dans chaque e-mail envoyé) et qui
   * porte pourtant de vraies données.
   *
   * SANS DÉFAUT, seule variable de ce fichier dans ce cas avec les secrets : une valeur par défaut
   * choisirait à la place de l'exploitant, et le jour où l'on oublie de la poser, elle choisirait
   * silencieusement. Ici l'API refuse de démarrer — un environnement qui ne dit pas qui peut s'y
   * inscrire est un environnement mal configuré, pas un environnement ouvert (règle dure n°5).
   */
  SIGNUP_MODE: z.enum(SIGNUP_MODES),
  /**
   * Les adresses qui peuvent s'inscrire en mode `invitation` sans avoir été invitées, séparées
   * par des virgules.
   *
   * Elle existe pour les COACHS : personne ne les invite, et sans elle un environnement fermé
   * n'accueillerait plus jamais le premier compte. Les athlètes, eux, passent par l'invitation
   * nominative de leur coach et n'ont rien à faire ici.
   *
   * Optionnelle, et son absence ne rouvre rien : elle rétrécit la porte au seul jeu des
   * invitations en cours.
   */
  SIGNUP_ALLOWED_EMAILS: z.preprocess(emptyAsUndefined, z.string().optional()),
  SENTRY_DSN: z.preprocess(emptyAsUndefined, z.url().optional()),
  AXIOM_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  AXIOM_DATASET: z.preprocess(emptyAsUndefined, z.string().optional()),
  // Object storage S3 (Scaleway en MVP). Optionnel au boot : l'API démarre sans, mais
  // toute opération d'upload/download échoue en 503 tant que les 5 variables ne sont pas
  // toutes fournies (buckets privés, accès par URL signée uniquement — CDC §10).
  S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.url().optional()),
  S3_REGION: z.preprocess(emptyAsUndefined, z.string().optional()),
  S3_BUCKET: z.preprocess(emptyAsUndefined, z.string().optional()),
  S3_ACCESS_KEY_ID: z.preprocess(emptyAsUndefined, z.string().optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  // Path-style (http://endpoint/bucket/…) requis par SILO, en local comme sur le NAS ;
  // virtual-hosted (défaut) pour Scaleway. "true" pour SILO, vide/"false" en prod.
  S3_FORCE_PATH_STYLE: z.preprocess(emptyAsUndefined, z.enum(["true", "false"]).optional()),
  /**
   * Jeton d'accès Expo (robot `cimavia-push`), exigé à chaque envoi de push depuis que la sécurité
   * renforcée est activée sur le compte (#357). Sans lui, Expo refuse TOUS les push, et l'échec ne
   * se voit que dans les tickets — personne ne le remarquerait. D'où l'obligation au démarrage sur
   * un tier déployé (`superRefine`) ; en développement il reste optionnel, un push local qui
   * échoue ne gêne personne.
   */
  EXPO_ACCESS_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  /**
   * Secret partagé du déclencheur de rappels (#47). Le tick est appelé de l'EXTÉRIEUR — un cron
   * in-process ne se déclenche pas sur du scale-to-zero, où aucun process ne tourne pour le tirer.
   *
   * Optionnel au boot, comme les `S3_*` : l'API démarre sans, tout le reste fonctionne. Mais son
   * absence **ferme la route** (503), elle ne l'ouvre pas — jamais « pas de secret, pas de
   * contrôle ». La même valeur doit exister aux trois endroits : secrets GitHub Actions, `.env` du
   * NAS, env Scaleway.
   *
   * Posé, il fait 32 caractères au moins (#357) : un secret court se devine, et la garde a beau
   * comparer en temps constant, elle ne protège pas une valeur qu'on peut énumérer.
   */
  REMINDER_TICK_SECRET: z.preprocess(
    emptyAsUndefined,
    z.string().min(SECRET_MIN_LENGTH, SECRET_TOO_SHORT).optional(),
  ),
  /**
   * Envoi d'e-mails transactionnels (#62). Optionnel au boot comme les `S3_*` : l'API démarre
   * sans, tout le reste fonctionne, et rien ne part — l'absence est journalisée, jamais silencieuse.
   *
   * Le minimum pour envoyer est `SMTP_HOST` + `SMTP_PORT` + `MAIL_FROM`. L'authentification est
   * LUE À PART et son absence n'est pas une configuration incomplète : le Mailpit du dev local
   * n'a pas de compte. C'est la seule divergence avec le contrat des `S3_*`, où les cinq
   * variables vont ensemble.
   */
  SMTP_HOST: z.preprocess(emptyAsUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_USER: z.preprocess(emptyAsUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyAsUndefined, z.string().optional()),
  // Expéditeur des e-mails, au format « Nom <adresse> » ou « adresse » seule. Sans lui, aucun
  // envoi n'est possible : un serveur SMTP refuse un message sans enveloppe d'expéditeur.
  MAIL_FROM: z.preprocess(emptyAsUndefined, z.string().optional()),
  /**
   * URL publique de l'app WEB, pour le pied des e-mails de notification (#65) — « gérer mes
   * notifications ».
   *
   * Distincte de `CORS_ORIGINS`, qui est une LISTE d'origines autorisées et ne désigne pas l'app
   * canonique : y piocher la première marcherait tant que l'ordre ne change pas, c'est-à-dire
   * jusqu'au jour où quelqu'un ajoute une origine de test en tête.
   *
   * Optionnelle : absente, le pied disparaît et le message part quand même. Un e-mail de
   * notification sans porte de sortie reste préférable à pas d'e-mail du tout — mais c'est un
   * réglage à faire en production, où un envoi récurrent sans lien de désabonnement finit
   * classé indésirable.
   */
  WEB_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
});

/**
 * Ce qu'un tier DÉPLOYÉ exige en plus (#357). Le texte de l'issue ne visait que la production ; le
 * NAS y est inclus parce qu'il porte les vraies données du Coach bêta et qu'il est joignable
 * publiquement — ce qui y démarrerait mal configuré n'attendrait pas la production pour fuir.
 */
export const envSchema = envShape.superRefine((env, ctx) => {
  if (!(DEPLOYED_TIERS as readonly string[]).includes(env.APP_ENV)) return;

  // Better Auth retire `Secure` de ses cookies quand l'URL est en http : la session partirait
  // en clair sur tout réseau intermédiaire.
  if (!env.BETTER_AUTH_URL.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_URL"],
      message: `https exigé en ${env.APP_ENV} — en http, les cookies de session perdent Secure`,
    });
  }
  if (env.EXPO_ACCESS_TOKEN === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["EXPO_ACCESS_TOKEN"],
      message: `obligatoire en ${env.APP_ENV} — sans lui, Expo refuse tous les push`,
    });
  }
});

export type EnvSchema = z.infer<typeof envSchema>;

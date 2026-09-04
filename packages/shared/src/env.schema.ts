import { z } from "zod";

// Une variable d'env optionnelle vide ("") est traitée comme absente, pas comme
// une valeur invalide : .env / .env.example contiennent des placeholders vides
// pour les services pas encore configurés (Sentry, Axiom…).
const emptyAsUndefined = (v: unknown) => (v === "" ? undefined : v);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  // Better Auth : secret de signature (obligatoire) + URL publique de l'API (base des liens).
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  // Origines supplémentaires de confiance pour Better Auth (IP LAN, tunnel ngrok/Expo…)
  // Format : "http://192.168.1.10:3000,https://abcd.ngrok.io"
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  // Origines navigateur autorisées (CORS + trustedOrigins), séparées par des virgules.
  // Ex. : "http://localhost:5173". Le scheme mobile (cimavia://) est ajouté côté code.
  CORS_ORIGINS: z.preprocess(emptyAsUndefined, z.string().optional()),
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
  // Path-style (http://endpoint/bucket/…) requis par MinIO local ; virtual-hosted (défaut)
  // pour Scaleway. "true" pour le dev MinIO, vide/"false" en prod.
  S3_FORCE_PATH_STYLE: z.preprocess(emptyAsUndefined, z.enum(["true", "false"]).optional()),
  // Notifications push Expo. Aucun secret n'est requis pour envoyer : le token d'accès ne
  // devient nécessaire que si l'on active « Enhanced Security » sur le compte Expo. Absent,
  // les push partent quand même — d'où l'optionnalité (et non un fail-fast au boot).
  EXPO_ACCESS_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  /**
   * Secret partagé du déclencheur de rappels (#47). Le tick est appelé de l'EXTÉRIEUR — un cron
   * in-process ne se déclenche pas sur du scale-to-zero, où aucun process ne tourne pour le tirer.
   *
   * Optionnel au boot, comme les `S3_*` : l'API démarre sans, tout le reste fonctionne. Mais son
   * absence **ferme la route** (503), elle ne l'ouvre pas — jamais « pas de secret, pas de
   * contrôle ». La même valeur doit exister aux trois endroits : secrets GitHub Actions, `.env` du
   * NAS, env Scaleway.
   */
  REMINDER_TICK_SECRET: z.preprocess(emptyAsUndefined, z.string().optional()),
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

export type EnvSchema = z.infer<typeof envSchema>;

import { z } from "zod";

// Une variable d'env optionnelle vide ("") est traitée comme absente, pas comme
// une valeur invalide : .env / .env.example contiennent des placeholders vides
// pour les services pas encore configurés (Sentry, Axiom…).
const emptyAsUndefined = (v: unknown) => (v === "" ? undefined : v);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
});

export type EnvSchema = z.infer<typeof envSchema>;

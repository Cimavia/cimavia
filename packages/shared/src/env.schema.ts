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
  // Origines navigateur autorisées (CORS + trustedOrigins), séparées par des virgules.
  // Ex. : "http://localhost:5173". Le scheme mobile (cimavia://) est ajouté côté code.
  CORS_ORIGINS: z.preprocess(emptyAsUndefined, z.string().optional()),
  SENTRY_DSN: z.preprocess(emptyAsUndefined, z.url().optional()),
  AXIOM_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  AXIOM_DATASET: z.preprocess(emptyAsUndefined, z.string().optional()),
});

export type EnvSchema = z.infer<typeof envSchema>;

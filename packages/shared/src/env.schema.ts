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
  SENTRY_DSN: z.preprocess(emptyAsUndefined, z.url().optional()),
  AXIOM_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  AXIOM_DATASET: z.preprocess(emptyAsUndefined, z.string().optional()),
});

export type EnvSchema = z.infer<typeof envSchema>;

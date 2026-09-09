import { z } from "zod";

/**
 * Ce que rend `GET /version` : quelle version de l'API tourne, et sur quel tier (#186).
 *
 * `version` et `build` sont NULLABLES et ne se replient sur rien. Hors image — un `pnpm dev`
 * local, un `docker build` sans `--build-arg` — il n'y a pas de version, et écrire « 0.0.0 » ou
 * « unknown » ferait passer une absence pour un fait (règle dure n°5). Le client rend `—`.
 *
 * `build` est le sha court du commit. Il distingue deux images portant le MÊME numéro, ce qui est
 * l'état normal entre deux releases : le tier dev republie à chaque push sur `main` alors que le
 * numéro, lui, n'avance qu'au merge de la PR de release.
 *
 * `env` est le TIER de déploiement, jamais déduit du numéro : une même version tourne
 * successivement sur les trois, et les confondre rendrait la phrase impossible à dire.
 */
export const versionDtoSchema = z.object({
  version: z.string().nullable(),
  build: z.string().nullable(),
  env: z.enum(["development", "staging", "production"]),
});

export type VersionDto = z.infer<typeof versionDtoSchema>;

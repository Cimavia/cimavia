import type { EnvSchema } from "@cmv/shared";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { browserOrigins } from "./config/origins";
import { ZodBodyValidationPipe } from "./zod/zod-body-validation.pipe";

/**
 * Méthodes HTTP exposées aux navigateurs. À déclarer EXPLICITEMENT : le défaut de la couche
 * CORS ne renvoie que `GET,HEAD,POST` → tout PATCH / PUT / DELETE est refusé en preflight,
 * alors même que la requête est légitime (édition, suppression).
 */
const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

/**
 * Le plus gros corps de requête accepté — 1 Mio, le défaut de Fastify, mais ÉCRIT (#297).
 *
 * Les médias ne passent jamais par l'API (URL signées), et le plus gros corps légitime — un
 * exercice à tous ses plafonds de blocs, de lignes et de colonnes — tient en dessous. Le plafond
 * borne ce que les schémas parsent avant de pouvoir refuser : sans lui, une évolution de Fastify
 * suffirait à le déplacer en silence. Les parseurs que Better Auth réinstalle (`bodyParser:
 * false`) n'ont pas de limite propre : ils héritent de celle-ci.
 */
export const API_BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * L'adaptateur HTTP de l'API, partagé par `main.ts` et les e2e : un plafond posé dans `main.ts`
 * seul ne serait jamais éprouvé par les tests.
 */
export function createHttpAdapter(): FastifyAdapter {
  return new FastifyAdapter({ logger: false, bodyLimit: API_BODY_LIMIT_BYTES });
}

/**
 * Configuration HTTP commune, appliquée par `main.ts` ET par les tests e2e.
 * Sans ce point unique, l'app e2e (montée par Test.createTestingModule, qui n'exécute pas
 * main.ts) tournerait SANS validation d'entrée ni CORS : les tests ne verraient pas ce que
 * la prod fait réellement.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ZodBodyValidationPipe());

  const config = app.get(ConfigService<EnvSchema, true>);
  app.enableCors({
    origin: browserOrigins(config),
    credentials: true,
    methods: CORS_METHODS,
  });
}

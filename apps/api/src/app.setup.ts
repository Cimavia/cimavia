import type { EnvSchema } from "@cmv/shared";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { browserOrigins } from "./config/origins";
import { ZodBodyValidationPipe } from "./zod/zod-body-validation.pipe";

/**
 * Méthodes HTTP exposées aux navigateurs. À déclarer EXPLICITEMENT : le défaut de la couche
 * CORS ne renvoie que `GET,HEAD,POST` → tout PATCH / PUT / DELETE est refusé en preflight,
 * alors même que la requête est légitime (édition, suppression).
 */
const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

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

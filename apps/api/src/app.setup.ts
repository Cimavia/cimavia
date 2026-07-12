import type { INestApplication } from "@nestjs/common";
import { ZodBodyValidationPipe } from "./zod/zod-body-validation.pipe";

/**
 * Configuration HTTP commune, appliquée par `main.ts` ET par les tests e2e.
 * Sans ce point unique, l'app e2e (montée par Test.createTestingModule, qui n'exécute pas
 * main.ts) tournerait SANS validation d'entrée : les tests ne verraient pas ce que la prod fait.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ZodBodyValidationPipe());
}

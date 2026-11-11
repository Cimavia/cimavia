import { createApiClient, createApiErrorMessage } from "@cmv/shared";
import i18n from "i18next";
import { requireApiUrl } from "./runtime-config";

/**
 * Client HTTP web. La mécanique (erreurs NestJS, 204, verbes) vit dans @cmv/shared ; ne restent
 * ici que les deux choses réellement propres au web : l'URL de base (lue dans `config.js`, #417) et
 * l'authentification par cookie de session du navigateur (`credentials: "include"`).
 */
export const api = createApiClient({
  baseUrl: requireApiUrl(),
  credentials: "include",
});

export type { ApiFieldError } from "@cmv/shared";
export {
  ApiError,
  isRateLimitedError,
  isStaleWriteError,
  isUnauthorizedError,
} from "@cmv/shared";

/**
 * Le message à montrer pour une erreur d'API, 429 de la limite de débit compris (#782).
 *
 * L'instance d'`i18next` et non `@/shared/lib/i18n` : l'importer l'initialiserait en français dans
 * chaque test qui charge ce client, là où ils lisent les clés brutes. L'app l'initialise au
 * démarrage, avant tout appel.
 */
export const apiErrorMessage = createApiErrorMessage((key) => i18n.t(key));

import { createApiClient } from "@cmv/shared";
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
export { ApiError, apiErrorMessage, isUnauthorizedError } from "@cmv/shared";

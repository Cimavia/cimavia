import { createApiClient } from "@cmv/shared";

/**
 * Client HTTP web. La mécanique (erreurs NestJS, 204, verbes) vit dans @cmv/shared ; ne restent
 * ici que les deux choses réellement propres au web : l'URL de base (variable Vite) et
 * l'authentification par cookie de session du navigateur (`credentials: "include"`).
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export const api = createApiClient({
  baseUrl: BASE_URL,
  credentials: "include",
});

export type { ApiFieldError } from "@cmv/shared";
export { ApiError, apiErrorMessage } from "@cmv/shared";

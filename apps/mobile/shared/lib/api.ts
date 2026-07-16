import { createApiClient } from "@cmv/shared";
import { authClient } from "@/shared/lib/auth";

/**
 * Client HTTP mobile. La mécanique (erreurs NestJS, 204, verbes) vit dans @cmv/shared ; ne reste
 * ici que ce qui est propre au mobile.
 *
 * Point ESSENTIEL : il n'y a pas de cookie jar. Le plugin `@better-auth/expo` garde le cookie de
 * session dans SecureStore et ne l'injecte que dans SES propres appels — un fetch nu partirait
 * donc en 401. On lit le cookie à CHAQUE requête (il change au fil de la vie de l'app).
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = createApiClient({
  baseUrl: BASE_URL,
  headers: () => ({ Cookie: authClient.getCookie() }),
});

export type { ApiFieldError } from "@cmv/shared";
export { ApiError, apiErrorMessage } from "@cmv/shared";

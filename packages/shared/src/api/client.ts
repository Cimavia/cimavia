/**
 * Client HTTP de l'API cimavia, partagé web ↔ mobile.
 *
 * Ce qui est COMMUN vit ici : la forme des erreurs NestJS (message string ou liste d'erreurs Zod),
 * le 204 sans corps, le typage des verbes. Ce qui DIFFÈRE reste à l'app : l'URL de base (variable
 * d'env Vite vs Expo) et l'authentification (cookie jar du navigateur vs cookie SecureStore
 * réinjecté à la main sur mobile) — d'où l'injection de `baseUrl`, `fetchFn` et `headers`.
 *
 * Aucune dépendance au DOM : les types de `fetch` sont décrits structurellement, pour que ce
 * module reste consommable par n'importe quel runtime (et que le .d.ts n'impose pas `lib: DOM`).
 */

export type ApiFieldError = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // null quand l'erreur n'est pas une erreur de validation (404, 403, 503…).
    readonly fieldErrors: ApiFieldError[] | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorMessage(error: unknown): string | null {
  return error instanceof ApiError ? error.message : null;
}

// Corps d'erreur NestJS : `message` vaut soit une string, soit la liste des erreurs Zod.
type NestErrorBody = { message?: string | ApiFieldError[]; error?: string };

function toApiError(status: number, body: unknown): ApiError {
  const { message, error } = (body ?? {}) as NestErrorBody;
  if (Array.isArray(message)) {
    return new ApiError(status, message[0]?.message ?? "Requête invalide", message);
  }
  return new ApiError(status, message ?? error ?? `Erreur ${status}`, null);
}

type ApiRequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  credentials?: "include";
};

type ApiResponse = { ok: boolean; status: number; text: () => Promise<string> };

// Signature structurelle du `fetch` global (web comme React Native s'y conforment).
export type ApiFetch = (url: string, init: ApiRequestInit) => Promise<ApiResponse>;

export type ApiClientConfig = {
  baseUrl: string;
  fetchFn: ApiFetch;
  // En-têtes évalués à CHAQUE requête : le cookie de session change au fil de la vie de l'app.
  headers?: () => Record<string, string>;
  // Web : envoie le cookie de session du navigateur.
  credentials?: "include";
};

export type ApiClient = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
};

export function createApiClient(config: ApiClientConfig): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = { ...(config.headers?.() ?? {}) };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    // Init construit sans clé undefined (exactOptionalPropertyTypes).
    const init: ApiRequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (config.credentials != null) init.credentials = config.credentials;

    const response = await config.fetchFn(`${config.baseUrl}${path}`, init);

    // 204 No Content (DELETE) → pas de corps à parser.
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;

    if (!response.ok) throw toApiError(response.status, data);
    return data as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}

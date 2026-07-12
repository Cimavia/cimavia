// Client HTTP de l'API cimavia. Cookies de session Better Auth → `credentials: "include"`.
// Les DTO sont typés par @cmv/shared : aucun type métier redéfini ici.
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

// Erreur de validation Zod renvoyée par l'API ({ path, message }) — exploitable champ par champ.
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

// Corps d'erreur NestJS : `message` vaut soit une string, soit la liste des erreurs Zod.
type NestErrorBody = { message?: string | ApiFieldError[]; error?: string };

function toApiError(status: number, body: unknown): ApiError {
  const { message, error } = (body ?? {}) as NestErrorBody;
  if (Array.isArray(message)) {
    return new ApiError(status, message[0]?.message ?? "Requête invalide", message);
  }
  return new ApiError(status, message ?? error ?? `Erreur ${status}`, null);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Init construit sans clé undefined (exactOptionalPropertyTypes).
  const init: RequestInit = { method, credentials: "include" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, init);

  // 204 No Content (DELETE) → pas de corps à parser.
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

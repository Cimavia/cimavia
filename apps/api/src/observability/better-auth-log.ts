import { redactUrlSecrets } from "@cmv/shared";
import { isAPIError } from "better-auth/api";
import type { Logger } from "pino";

/** Les niveaux que Better Auth passe à son `logger.log` — `success` y arrive déjà en `info`. */
export type BetterAuthLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Ce que Better Auth journalise et ce qu'il fait de ses erreurs, branché sur Pino (#466). Deux
 * points d'entrée, parce que la bibliothèque en a deux :
 * - `log` — son `logger.log`, qui reçoit ce qu'elle écrit elle-même : une tâche de fond en échec,
 *   une session qu'elle n'a pas pu lire, une origine refusée, un mot de passe faux ;
 * - `onError` — son `onAPIError.onError`, qui reçoit toute erreur levée par une de ses routes.
 *
 * Sans eux, elle écrivait sur la console : stdout du conteneur, jamais Axiom, jamais Sentry. Un
 * 500 de connexion ne laissait que son statut dans la ligne de la requête, sans sa cause.
 *
 * Reste sur la console, hors de portée : le `# SERVER_ERROR` que le routeur `better-call` écrit
 * pour une exception qui n'est pas un `APIError`. Il ne le saute que si `onError` rend une
 * réponse, et Better Auth ne transmet pas celle de son `onAPIError.onError`.
 */
export type BetterAuthLogging = {
  log: (level: BetterAuthLogLevel, message: unknown, ...args: unknown[]) => void;
  onError: (error: unknown) => void;
};

/** Better Auth passe parfois l'erreur elle-même à la place du message (`ctx.logger.error(e)`). */
const FALLBACK_MESSAGE = "Better Auth";

/** Assez pour lire « APIError ← PrismaClientKnownRequestError ← … », sans suivre une boucle. */
const MAX_CAUSE_DEPTH = 3;

/**
 * L'erreur d'une ligne de Better Auth, en LISTE BLANCHE — le sérialiseur par défaut de pino
 * recopie toute propriété énumérable : le `body` et les `headers` d'un `APIError`, le `meta` d'une
 * erreur Prisma, l'`input` d'une URL invalide (l'adresse reçue, `?token=` compris). Restent le
 * type, le `code` (`P2002`, `ECONNREFUSED`), le message et la pile blanchis, et la cause.
 *
 * Ne vaut que pour Axiom : `pinoIntegration` lit l'`Error` brute, et ce qui part chez Sentry passe
 * par `sentry-scrub`.
 */
export function serializeAuthError(err: unknown, depth = 0): Record<string, unknown> {
  if (!(err instanceof Error)) {
    // Une valeur levée qui n'est pas une erreur : son texte si c'en est un, son type sinon — un
    // objet quelconque recopié serait la porte que la liste blanche ferme.
    return typeof err === "string" ? { message: redactUrlSecrets(err) } : { type: typeof err };
  }
  const { code } = err as { code?: unknown };
  return {
    type: err.name,
    ...(typeof code === "string" && { code }),
    message: redactUrlSecrets(err.message),
    ...(err.stack !== undefined && { stack: redactUrlSecrets(err.stack) }),
    ...(err.cause !== undefined &&
      depth < MAX_CAUSE_DEPTH && { cause: serializeAuthError(err.cause, depth + 1) }),
  };
}

/**
 * Le `logger` est la racine de `nestjs-pino` : les lignes partent dans le même transport, avec
 * `context: "BetterAuth"` pour les isoler dans Axiom.
 *
 * Le message part blanchi par `redactUrlSecrets` (« Invalid callbackURL: … » recopie l'URL reçue),
 * l'erreur par `serializeAuthError`. Les autres arguments sont jetés : ce sont des objets que la
 * bibliothèque choisit, et rien ne dit que le prochain ne portera pas une adresse ou une session.
 *
 * `log` ne monte jamais au-dessus de `warn` : le niveau `error` crée un événement Sentry
 * (`pinoIntegration`), et Better Auth journalise souvent une panne juste avant de la relever en
 * `APIError` 500 — que `onError` (ses routes) ou le filtre d'exception de Nest (un `getSession` de
 * l'AuthGuard) envoient déjà. En `error`, chaque panne compterait double. Le reste — une origine
 * refusée face à un robot — n'a rien à faire chez Sentry.
 *
 * `onError` ne journalise que les pannes : un `APIError` 4xx (mot de passe faux, adresse non
 * vérifiée) est un refus, que la ligne de la requête dit déjà en `warn`. Toute autre erreur — un
 * `APIError` 500, ou une exception imprévue que la bibliothèque rend en 500 — part en `error`.
 */
export function betterAuthLogging(logger: Logger): BetterAuthLogging {
  const log = logger.child({ context: "BetterAuth" }, { serializers: { err: serializeAuthError } });

  return {
    log(level, message, ...args) {
      const err = [message, ...args].find((arg) => arg instanceof Error);
      const text = typeof message === "string" ? redactUrlSecrets(message) : FALLBACK_MESSAGE;
      const target = level === "error" ? "warn" : level;
      if (err === undefined) log[target](text);
      else log[target]({ err }, text);
    },
    onError(error) {
      if (isAPIError(error) && error.statusCode < 500) return;
      log.error({ err: error }, "Erreur d'une route Better Auth");
    },
  };
}

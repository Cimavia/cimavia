import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { redactUrlSecrets } from "@cmv/shared";
import { isAPIError } from "better-auth/api";
import type { PinoLogger } from "nestjs-pino";
import type { Logger } from "pino";
import { AUTH_ROUTE_ERROR_MESSAGE } from "./log-messages";
import { authRequestLogger } from "./logger.config";
import { captureHttpException, markSentByLog } from "./sentry-capture";

/** Les niveaux que Better Auth passe à son `logger.log` — `success` y arrive déjà en `info`. */
export type BetterAuthLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Ce que Better Auth journalise et ce qu'il fait de ses erreurs, branché sur Pino (#466). Deux
 * points d'entrée, parce que la bibliothèque en a deux :
 * - `log` — son `logger.log`, qui reçoit ce qu'elle écrit elle-même : une tâche de fond en échec,
 *   une session qu'elle n'a pas pu lire ou effacer, une origine refusée, un mot de passe faux ;
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

/** Ce que ce module lit de `PinoLogger` : le logger du contexte courant, et de quoi en ouvrir un. */
export type ContextLogger = Pick<PinoLogger, "logger" | "runInContext">;

/**
 * La requête `/api/auth/*` en cours : de quoi la nommer chez Sentry, et si une de ses lignes y a
 * déjà envoyé une panne.
 */
type AuthRequest = { method: string | undefined; route: string; failureSent: boolean };

const authRequest = new AsyncLocalStorage<AuthRequest>();

/** Better Auth passe parfois l'erreur elle-même à la place du message (`ctx.logger.error(e)`). */
const FALLBACK_MESSAGE = "Better Auth";

/** Assez pour lire « APIError ← PrismaClientKnownRequestError ← … », sans suivre une boucle. */
const MAX_CAUSE_DEPTH = 3;

/**
 * Le chemin de la requête, sans sa requête et blanchi : Better Auth n'a pas de motif de route
 * déclaré, et `/reset-password/<jeton>` porte un secret. Sert d'empreinte aux refus chez Sentry.
 */
function routeOf(url: string | undefined): string {
  return redactUrlSecrets(url?.split("?")[0] ?? "");
}

/**
 * Fait tourner `fn` comme la requête `/api/auth/*` décrite : ce que `log` et `onError` y écrivent
 * s'y rattache.
 */
export function runInAuthRequest<T>(
  req: { method?: string | undefined; url?: string | undefined },
  fn: () => T,
): T {
  return authRequest.run({ method: req.method, route: routeOf(req.url), failureSent: false }, fn);
}

/**
 * Le `middleware` du module Better Auth (#466), appelé sur `/api/auth/*` seules, juste avant de
 * leur répondre :
 * - la ligne de la requête, par `authRequestLogger` ;
 * - un contexte nestjs-pino lié à la requête (`runInContext`, `req` en binding — sérialisé par la
 *   même liste blanche), pour que les lignes de Better Auth portent son `req.id` comme le ferait
 *   une ligne écrite pendant une route Nest ;
 * - la requête d'auth en cours, que lisent `log` et `onError`.
 */
export function authMiddleware(pino: ContextLogger) {
  // Construit au démarrage, hors requête : `pino.logger` est donc la racine.
  const logRequest = authRequestLogger(pino.logger);
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    logRequest(req, res, () => {
      pino.runInContext(() => runInAuthRequest(req, next), { bindings: { req } });
    });
  };
}

/**
 * L'erreur d'une ligne de Better Auth, en LISTE BLANCHE — le sérialiseur par défaut de pino
 * recopie toute propriété énumérable : le `body` et les `headers` d'un `APIError`, le `meta` d'une
 * erreur Prisma, l'`input` d'une URL invalide (l'adresse reçue, `?token=` compris). Restent le
 * type, le `code` (`P2002`, `ECONNREFUSED`), le message et la pile blanchis, et la cause.
 *
 * La liste blanche porte sur les PROPRIÉTÉS, pas sur le texte du message : celui d'une erreur de
 * validation Prisma recopie les arguments de la requête. Vrai sur toutes les routes, et chez
 * Sentry (qui reçoit l'`Error` brute, `pinoIntegration` la lisant avant sérialisation) : relève de
 * #783, pas de Better Auth.
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
 * Les refus de la vérification d'origine (`origin-check` de Better Auth) : un `Origin` ou un
 * `callbackURL` étranger, que n'importe quel script envoie sans cookie ni compte. Sa ligne `warn`
 * et celle de la requête les disent dans Axiom ; chez Sentry, ce serait un événement par requête,
 * comme le 429 de la limite de débit (#782).
 */
const ORIGIN_REFUSALS = new Set([
  "INVALID_ORIGIN",
  "MISSING_OR_NULL_ORIGIN",
  "INVALID_CALLBACK_URL",
  "INVALID_REDIRECT_URL",
  "INVALID_ERROR_CALLBACK_URL",
  "INVALID_NEW_USER_CALLBACK_URL",
  "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
]);

function isOriginRefusal(error: unknown): boolean {
  const code = isAPIError(error) ? (error.body as { code?: unknown } | undefined)?.code : undefined;
  return typeof code === "string" && ORIGIN_REFUSALS.has(code);
}

/** Une panne, pas un refus : un `APIError` 4xx journalisé en `error` reste un refus. */
function isFailure(err: Error): boolean {
  return !(isAPIError(err) && err.statusCode < 500);
}

/** Note que cette panne est partie chez Sentry par sa ligne, et que sa requête en a envoyé une. */
function noteSentByLog(err: Error): void {
  markSentByLog(err);
  const current = authRequest.getStore();
  if (current) current.failureSent = true;
}

/**
 * `current` rend le logger du contexte courant (`PinoLogger.logger`) : celui de la requête — Nest,
 * ou `/api/auth/*` par `authMiddleware` —, la racine hors requête. Relu à chaque ligne, donc au
 * niveau courant de la racine. Les lignes portent `context: "BetterAuth"`.
 *
 * `log` : le message part blanchi par `redactUrlSecrets` (« Invalid callbackURL: … » recopie l'URL
 * reçue), l'erreur par `serializeAuthError`. Les autres arguments sont jetés : des objets que la
 * bibliothèque choisit, et rien ne dit que le prochain ne portera pas une adresse ou une session.
 * Une erreur portant une panne reste en `error`, donc part chez Sentry (`pinoIntegration`) : c'est
 * souvent le seul endroit où Better Auth la montre — sign-out l'avale et répond 200, une tâche de
 * fond n'a pas de réponse. Une erreur SANS exception (« Invalid origin » face à un robot), ou dont
 * l'exception est un refus (`APIError` 4xx), descend en `warn` : Axiom la garde.
 *
 * `onError` suit la politique des routes Nest (`captureHttpException`) : un refus (4xx) en
 * `warning`, regroupé par statut et chemin, sauf le 401 et les refus d'origine ; une panne en
 * `error`, plus sa ligne pour Axiom. Une panne déjà partie par sa ligne n'est pas renvoyée : celle
 * qui la porte en `cause` (`get-session`) se reconnaît à sa cause ; un 500 relevé SANS cause
 * (`revoke-sessions`, `list-sessions`) à ce que sa requête a déjà envoyé une panne. Écart assumé :
 * un second 500 sans cause, sans lien avec la première panne, n'aurait alors que sa ligne Axiom.
 */
export function betterAuthLogging(current: () => Logger): BetterAuthLogging {
  const log = () =>
    current().child({ context: "BetterAuth" }, { serializers: { err: serializeAuthError } });

  return {
    log(level, message, ...args) {
      const err = [message, ...args].find((arg) => arg instanceof Error);
      const text = typeof message === "string" ? redactUrlSecrets(message) : FALLBACK_MESSAGE;
      if (err === undefined) {
        log()[level === "error" ? "warn" : level](text);
        return;
      }
      const failure = level === "error" && isFailure(err);
      log()[level === "error" && !failure ? "warn" : level]({ err }, text);
      if (failure) noteSentByLog(err);
    },
    onError(error) {
      if (isOriginRefusal(error)) return;
      const status = isAPIError(error) ? error.statusCode : 500;
      const request = authRequest.getStore();
      const causeless = isAPIError(error) && (error as { cause?: unknown }).cause === undefined;
      if (!(status >= 500 && causeless && request?.failureSent)) {
        captureHttpException(
          error,
          status,
          request && { method: request.method, routeOptions: { url: request.route } },
        );
      }
      // Pour Axiom seulement : `sentry.config` écarte cette ligne. APRÈS la capture : Dedupe retient
      // aussi l'événement que `beforeSend` écarte, et la capture de la même erreur, venue ensuite,
      // serait jetée comme doublon.
      if (status >= 500) log().error({ err: error }, AUTH_ROUTE_ERROR_MESSAGE);
    },
  };
}

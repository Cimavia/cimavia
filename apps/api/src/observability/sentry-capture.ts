import { HttpStatus } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import * as Sentry from "@sentry/nestjs";

/** Ce que la capture lit de la requête Fastify, sans dépendre de `fastify`. */
export type CapturedRequest = {
  method?: string | undefined;
  routeOptions?: { url?: string | undefined };
};

/** Le motif de route que les sondes de l'hébergeur interrogent en boucle. */
const HEALTH_ROUTE = /^\/health(?:\/|$)/;

/**
 * Ce qui part chez Sentry, et à quel niveau (#697) : `error` pour une panne (un statut ≥ 500, ou
 * une exception que personne n'a prévue), `warning` pour un refus (4xx). Le niveau sépare les deux
 * dans l'interface ; le regroupement de `captureHttpException` évite une issue par occurrence d'un
 * refus.
 *
 * `null` pour ce qui ne dit rien du code :
 * - le 401 : sur les routes des apps il veut dire « session perdue », l'état normal au bout de sept
 *   jours (`isUnauthorizedError`) ;
 * - le 503 de la sonde de santé, qu'elle répète en boucle : la panne se lit par elle ;
 * - le 429 de la limite de débit (#782) : un script qui insiste en produirait autant que de
 *   requêtes, et viderait le quota. Il reste dans la ligne de journal de la requête. Les autres 429
 *   — un mot de passe faux de trop sur la suppression du compte — disent une tentative, et partent.
 */
export function sentryLevelOf(
  status: number,
  route: string | undefined,
  exception?: unknown,
): "error" | "warning" | null {
  if (status === HttpStatus.UNAUTHORIZED) return null;
  if (exception instanceof ThrottlerException) return null;
  if (status === HttpStatus.SERVICE_UNAVAILABLE && route && HEALTH_ROUTE.test(route)) return null;
  return status >= HttpStatus.INTERNAL_SERVER_ERROR ? "error" : "warning";
}

/**
 * Envoie l'exception à Sentry, au niveau de `sentryLevelOf`. On capture nous-mêmes plutôt que par
 * `@SentryExceptionCaptured()` : ce décorateur écarte TOUTE `HttpException`, 5xx compris — un
 * storage non configuré n'arrivait jamais chez Sentry. Les 4xx y entrent désormais, en `warning` :
 * l'inverse du principe qui était écrit ici (« ne pas polluer Sentry »), tranché en #696 et
 * consigné dans `docs/dette/livraison-et-deploiement.md`.
 */
export function captureHttpException(
  exception: unknown,
  status: number,
  request: CapturedRequest | undefined,
): void {
  // Le motif déclaré (`/sessions/:id`), pas l'URL : elle porte des identifiants et, sur la
  // révocation d'un appareil, un jeton. Absent pour une route inconnue (404).
  const route = request?.routeOptions?.url;
  const level = sentryLevelOf(status, route, exception);
  if (!level || sentByLogLine(exception)) return;

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag("http.status_code", String(status));
    // Un refus (4xx) porte un message français par variante : sans empreinte, Sentry en ferait une
    // issue par message. Une 5xx garde le regroupement par pile, qui sépare les sites d'où elle est
    // levée ; une exception non HTTP aussi.
    if (level === "warning") {
      scope.setFingerprint([String(status), `${request?.method ?? "?"} ${route ?? "?"}`]);
    }
    Sentry.captureException(exception);
  });
}

/**
 * Les erreurs déjà parties chez Sentry par une ligne de journal `error` (#466). Better Auth
 * journalise une panne, puis la relève — telle quelle, ou en `APIError` 500 qui la porte en
 * `cause` (`getSession`, qu'appelle l'AuthGuard) : la capturer encore, par le filtre de Nest ou
 * par `onError`, ferait deux événements d'une panne. Un `WeakSet` : la marque part avec l'erreur.
 */
const sentByLog = new WeakSet<object>();

/** Note qu'une ligne `error` vient d'envoyer cette erreur chez Sentry (`pinoIntegration`). */
export function markSentByLog(error: object): void {
  sentByLog.add(error);
}

/** Assez pour « APIError ← erreur Prisma ← erreur du pilote », sans suivre une boucle. */
const MAX_CAUSE_DEPTH = 3;

/** L'exception, ou l'une de ses causes, est déjà partie par une ligne de journal. */
function sentByLogLine(exception: unknown, depth = 0): boolean {
  if (typeof exception !== "object" || exception === null || depth > MAX_CAUSE_DEPTH) return false;
  return (
    sentByLog.has(exception) || sentByLogLine((exception as { cause?: unknown }).cause, depth + 1)
  );
}

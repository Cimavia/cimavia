import { HttpStatus } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";

/** Ce que la capture lit de la requête Fastify, sans dépendre de `fastify`. */
export type CapturedRequest = { method?: string; routeOptions?: { url?: string } };

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
 * - le 503 de la sonde de santé, qu'elle répète en boucle : la panne se lit par elle.
 */
export function sentryLevelOf(
  status: number,
  route: string | undefined,
): "error" | "warning" | null {
  if (status === HttpStatus.UNAUTHORIZED) return null;
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
  const level = sentryLevelOf(status, route);
  if (!level) return;

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

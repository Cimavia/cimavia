/**
 * Les messages de journal que `sentry.config` reconnaît. Module SANS AUCUN import, et qui doit le
 * rester : `instrument.ts` le charge (par `sentry.config`) AVANT `Sentry.init`, et tout module
 * chargé avant ce point — `@nestjs/common`, `pino` — échappe à l'instrumentation de Sentry.
 */

/**
 * La ligne qu'écrit la panne d'une route Better Auth (#466), pour Axiom : `captureHttpException`
 * l'a déjà envoyée, comme le filtre d'exception pour une route Nest.
 */
export const AUTH_ROUTE_ERROR_MESSAGE = "Erreur d'une route Better Auth";

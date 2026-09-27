import { redactUrlSecrets } from "@cmv/shared";
import type { Breadcrumb, Event } from "@sentry/nestjs";

// ⚠️ Ce fichier est chargé par `instrument.ts`, AVANT NestJS : il ne doit rien importer qui
// charge Nest — Sentry n'instrumenterait plus les modules déjà en mémoire. D'où le nom de l'en-tête
// du tick écrit en dur plutôt qu'importé de sa garde ; un test vérifie qu'ils restent égaux.

/**
 * Les en-têtes qui ne partent JAMAIS chez Sentry (#433). L'API reste en `sendDefaultPii: true`
 * (#183) : les autres en-têtes partent, et l'IP avec.
 *
 * `cookie` porte la session Better Auth, rejouable sept jours ; `authorization` le jeton bearer
 * d'un client qui en poserait un ; le secret du tick déclenche les rappels ; `set-cookie` est la
 * session que la connexion vient d'ouvrir. Sentry recopie les en-têtes d'un événement TELS QUELS :
 * sa liste de clés sensibles ne sert qu'aux attributs de span.
 */
export const REMINDER_TICK_HEADER_NAME = "x-cimavia-tick-secret";

const SECRET_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  REMINDER_TICK_HEADER_NAME,
]);

function isSecretHeader(name: string): boolean {
  return SECRET_HEADERS.has(name.toLowerCase());
}

/**
 * Sur un span, Sentry range un en-tête sous `http.request.header.<nom>` — tirets changés en `_`,
 * et un cookie éclaté en `…header.cookie.<nom du cookie>`.
 */
const SECRET_SPAN_ATTRIBUTE = new RegExp(
  `^http\\.(?:request|response)\\.header\\.(?:${[...SECRET_HEADERS]
    .map((name) => name.replaceAll("-", "_"))
    .join("|")})(?:\\.|$)`,
  "i",
);

/**
 * Ce qui reste d'un en-tête ou d'un attribut passe AUSSI par `redactUrlSecrets` : le `referer`
 * d'une requête partie de `/reset-password?token=…`, ou `http.target` sur le span serveur, portent
 * une URL au même titre que `request.url`.
 */
function scrubStrings<V>(entries: [string, V][]): [string, V][] {
  // Une chaîne blanchie reste une chaîne : le type de la valeur ne change pas.
  return entries.map(([key, value]) => [
    key,
    typeof value === "string" ? (redactUrlSecrets(value) as V & string) : value,
  ]);
}

function scrubSpanData<V>(data: Record<string, V>): Record<string, V> {
  return Object.fromEntries(
    scrubStrings(Object.entries(data).filter(([key]) => !SECRET_SPAN_ATTRIBUTE.test(key))),
  );
}

type Span = NonNullable<Event["spans"]>[number];

function scrubSpan(span: Span): Span {
  return {
    ...span,
    data: scrubSpanData(span.data),
    ...(span.description !== undefined && { description: redactUrlSecrets(span.description) }),
  };
}

/**
 * La requête d'un événement. `cookies` saute en entier : c'est le même cookie que l'en-tête,
 * déjà découpé. `query_string` est une chaîne sur Node, mais le type admet un objet ou des paires :
 * `URLSearchParams` ramène les trois formes à une chaîne, que la même liste blanchit.
 */
function scrubRequest(request: NonNullable<Event["request"]>): Event["request"] {
  const { cookies: _session, ...rest } = request;
  const scrubbed = { ...rest };
  if (scrubbed.url !== undefined) scrubbed.url = redactUrlSecrets(scrubbed.url);
  if (scrubbed.headers) {
    scrubbed.headers = Object.fromEntries(
      scrubStrings(Object.entries(scrubbed.headers).filter(([name]) => !isSecretHeader(name))),
    );
  }
  if (scrubbed.query_string !== undefined) {
    const query =
      typeof scrubbed.query_string === "string"
        ? scrubbed.query_string
        : new URLSearchParams(scrubbed.query_string).toString();
    scrubbed.query_string = redactUrlSecrets(`?${query}`).slice(1);
  }
  return scrubbed;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    ...(breadcrumb.message !== undefined && { message: redactUrlSecrets(breadcrumb.message) }),
    ...(breadcrumb.data && { data: scrubSpanData(breadcrumb.data) }),
  };
}

/**
 * Le `beforeSend` ET le `beforeSendTransaction` de l'API (#433).
 *
 * Les deux, parce que la fuite ne demande pas d'erreur : une transaction échantillonnée porte la
 * même requête qu'un événement d'erreur, et ses spans l'URL complète — `GET
 * /api/auth/reset-password/<jeton>` en nom de transaction, en `http.target`, en `http.url`. Le
 * corps des requêtes, lui, n'est jamais lu (`maxIncomingRequestBodySize: "none"`) : il n'y a rien
 * à en retirer ici.
 *
 * Tout ce qui porte une URL est blanchi par `redactUrlSecrets`, la liste partagée avec le web et
 * avec les journaux Pino.
 */
export function scrubEvent<T extends Event>(event: T): T {
  const contextData = event.contexts?.trace?.data;
  return {
    ...event,
    ...(event.request && { request: scrubRequest(event.request) }),
    ...(event.transaction !== undefined && { transaction: redactUrlSecrets(event.transaction) }),
    ...(event.spans && { spans: event.spans.map(scrubSpan) }),
    ...(event.breadcrumbs && { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }),
    ...(event.contexts?.trace &&
      contextData && {
        contexts: {
          ...event.contexts,
          trace: { ...event.contexts.trace, data: scrubSpanData(contextData) },
        },
      }),
  };
}

import { redactUrlSecrets } from "@cmv/shared";
import type { Breadcrumb, Event, NodeOptions } from "@sentry/nestjs";

// ⚠️ Ce fichier est chargé par `instrument.ts`, AVANT NestJS : il ne doit rien importer qui
// charge Nest — Sentry n'instrumenterait plus les modules déjà en mémoire. D'où le nom de l'en-tête
// du tick écrit en dur plutôt qu'importé de sa garde ; un test vérifie qu'ils restent égaux.

/**
 * Les en-têtes qui ne partent JAMAIS chez Sentry (#433). L'API collecte les en-têtes et l'IP
 * (#183, `dataCollection` depuis #669) : les autres en-têtes partent.
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
 * Sur un span, Sentry range un en-tête sous `http.request.header.<nom>`. La v11 garde le nom tel
 * quel, cookies d'un bloc ; la v10 changeait les tirets en `_` et éclatait un cookie en
 * `…header.cookie.<nom du cookie>`. Les deux formes restent reconnues : une instrumentation qui
 * suivrait encore l'ancienne ne doit pas suffire à faire partir un secret.
 */
const SECRET_SPAN_ATTRIBUTE = new RegExp(
  String.raw`^http\.(?:request|response)\.header\.(?:${[...SECRET_HEADERS]
    .map((name) => name.replaceAll("-", "[-_]"))
    .join("|")})(?:\.|$)`,
  "i",
);

/**
 * Une valeur d'attribut est brute — chaîne, nombre, booléen ou tableau — ou un objet `{ value }`.
 * Un en-tête arrive en tableau depuis la v11 (`["https://app.test/?token=…"]`).
 */
function scrubAttributeValue(value: unknown, redact = redactUrlSecrets): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => scrubAttributeValue(item, redact));
  if (value !== null && typeof value === "object" && "value" in value) {
    return { ...value, value: scrubAttributeValue(value.value, redact) };
  }
  return value;
}

/**
 * Une chaîne de requête SANS son `?` — `query_string` d'un événement, `url.query` d'un span : la
 * liste ne reconnaît un paramètre qu'après `?` ou `&`, et laisserait passer le premier.
 */
function redactQueryString(query: string): string {
  return redactUrlSecrets(`?${query}`).slice(1);
}

/**
 * Les attributs d'un span, les données de trace d'une erreur ou d'un fil d'Ariane : les en-têtes
 * secrets sautent, et tout ce qui reste passe par `redactUrlSecrets` — `url.full`, `url.path`, le
 * `referer`, l'`url` d'un fetch. Toutes les chaînes, pas une liste de clés : la prochaine clé qui
 * portera une URL n'aura pas à y être ajoutée.
 */
function scrubSpanData<D extends Record<string, unknown>>(data: D): D {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !SECRET_SPAN_ATTRIBUTE.test(key))
      .map(([key, value]) => [
        key,
        scrubAttributeValue(value, key === "url.query" ? redactQueryString : redactUrlSecrets),
      ]),
  ) as D;
}

/** Ce qui reste d'un en-tête d'événement passe AUSSI par `redactUrlSecrets` — le `referer`. */
function scrubStrings<V>(entries: [string, V][]): [string, V][] {
  // Une chaîne blanchie reste une chaîne : le type de la valeur ne change pas.
  return entries.map(([key, value]) => [
    key,
    typeof value === "string" ? (redactUrlSecrets(value) as V & string) : value,
  ]);
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
    scrubbed.query_string = redactQueryString(query);
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
 * Le `beforeSend` de l'API (#433) : les erreurs. Les spans passent par `scrubSpan`.
 *
 * Le corps des requêtes, lui, n'est jamais lu (`maxRequestBodySize: "none"`) : il n'y a rien à en
 * retirer ici. Tout ce qui porte une URL est blanchi par `redactUrlSecrets`, la liste partagée avec
 * le web et avec les journaux Pino.
 */
export function scrubEvent<T extends Event>(event: T): T {
  const contextData = event.contexts?.trace?.data;
  return {
    ...event,
    ...(event.request && { request: scrubRequest(event.request) }),
    ...(event.transaction !== undefined && { transaction: redactUrlSecrets(event.transaction) }),
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

/** Le span tel que `beforeSendSpan` le reçoit — `@sentry/nestjs` n'en exporte pas le nom. */
type StreamedSpan = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];

/**
 * Le `beforeSendSpan` de l'API (#433, #669). La v11 envoie les spans un par un, en flux, et ne
 * construit plus de transaction : `beforeSendTransaction` n'est plus jamais appelé, et c'est ICI
 * que passe ce qu'une requête échantillonnée emporte sans qu'aucune erreur ne soit levée — l'URL
 * (`url.full`, `url.path`, le nom du span), le `referer`, les en-têtes secrets. Les liens vers
 * d'autres spans portent des attributs aussi : même traitement.
 *
 * Le callback ne peut pas écarter un span, seulement le réécrire : un attribut secret est retiré,
 * jamais remplacé par une valeur inventée.
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  return {
    ...span,
    name: redactUrlSecrets(span.name),
    attributes: scrubSpanData(span.attributes),
    ...(span.links && {
      links: span.links.map((link) => ({
        ...link,
        ...(link.attributes && { attributes: scrubSpanData(link.attributes) }),
      })),
    }),
  };
}

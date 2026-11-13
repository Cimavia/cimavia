import { isIP } from "node:net";
import { type ExecutionContext, SetMetadata } from "@nestjs/common";
import {
  SkipThrottle,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from "@nestjs/throttler";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Les routes qui coûtent, et que le plafond global ne suffit pas à protéger (#782) :
 * - `UPLOAD` : chaque URL signée autorise un PUT de ~50 Mo vers le stockage, poste de coût n°1 ;
 * - `MESSAGE` : l'envoi déclenche push et e-mail, attendus dans la requête (#350) ;
 * - `INVITATION` : un e-mail vers une adresse QUELCONQUE — c'est la réputation de l'expéditeur qui
 *   paie. Les autres e-mails (plans, débriefs) ne vont qu'à des comptes déjà liés.
 */
export const RateLimitPolicy = {
  UPLOAD: "upload",
  MESSAGE: "message",
  INVITATION: "invitation",
} as const;

export type RateLimitPolicy = (typeof RateLimitPolicy)[keyof typeof RateLimitPolicy];

/** Le compteur qui vaut sur TOUTE route : il porte le nom que `NoRateLimit` désactive. */
export const GLOBAL_THROTTLER = "global";

/**
 * Les bornes, par acteur. Non mesurées — tranché en #782 : Axiom n'a jamais reçu de journaux, et
 * ceux-ci ne portent pas l'id de l'utilisateur. Elles se déduisent de l'usage que le code produit :
 * - un onglet web interroge l'API ≈ 16 fois par minute (polling à 10, 15 et 30 s) ; 300 laisse
 *   plusieurs onglets et les rafales d'une navigation, et coupe un script à 5 requêtes par seconde ;
 * - un débrief part en un lot de 30 médias au plus (`MAX_FEEDBACK_PHOTOS` + `MAX_FEEDBACK_VIDEOS`),
 *   une URL chacun : 40 par minute le laissent passer en entier. Un lot de messages en compte 10
 *   (`MAX_MESSAGE_MEDIA_BATCH`) : 30 messages par minute en laissent passer trois d'affilée.
 */
export const RATE_LIMITS = {
  global: { ttl: MINUTE_MS, limit: 300 },
  uploadPerMinute: { ttl: MINUTE_MS, limit: 40 },
  uploadPerHour: { ttl: HOUR_MS, limit: 200 },
  message: { ttl: MINUTE_MS, limit: 30 },
  invitation: { ttl: HOUR_MS, limit: 30 },
} as const;

const RATE_LIMIT_POLICY_KEY = "cmv:rate-limit-policy";

/**
 * Soumet la route — ou toutes celles d'un contrôleur — à une borne serrée, EN PLUS du plafond
 * global. La borne se compte par acteur, toutes routes de la politique confondues : les quatre URL
 * d'upload partagent la leur, sans quoi le coût qu'elle protège serait multiplié par quatre.
 */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY_KEY, policy);

/** Les compteurs des bornes serrées, dans l'ordre où la garde les passe. */
const POLICY_THROTTLERS = {
  uploadPerMinute: "upload-minute",
  uploadPerHour: "upload-hour",
  message: "message",
  invitation: "invitation",
} as const;

/**
 * Sort la route de tout compteur — le global ET ceux des politiques, qu'un `RateLimit` posé sur
 * son contrôleur lui appliquerait sinon. Réservé aux routes sans acteur qu'une machine appelle en
 * boucle : la sonde de santé, qu'un 429 ferait déclarer l'API morte, et le tick des rappels, gardé
 * par son propre secret.
 */
export const NoRateLimit = () =>
  SkipThrottle(
    Object.fromEntries(
      [GLOBAL_THROTTLER, ...Object.values(POLICY_THROTTLERS)].map((name) => [name, true]),
    ),
  );

/** Ce que le compteur lit de la requête Fastify. */
type TrackedRequest = {
  user?: { id?: unknown } | null;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * L'IP du client, `null` si on ne la connaît pas (#781).
 *
 * Avec un en-tête configuré, lui seul : `request.ip` y serait l'adresse du proxy — `cloudflared`
 * sur le NAS —, la même pour tout le monde. Et une seule adresse valide : Node joint un en-tête
 * répété en `a, b`, et une valeur libre laisserait un client changer de compteur à chaque requête
 * — Better Auth refuse les mêmes. Sinon, l'en-tête ne dit rien qu'on puisse croire, et l'on ne se
 * rabat pas sur le proxy pour autant. Sans en-tête configuré (local), la connexion elle-même.
 */
function clientIp(request: TrackedRequest, clientIpHeader: string | undefined): string | null {
  if (clientIpHeader === undefined) return request.ip ?? null;
  const value = request.headers?.[clientIpHeader];
  if (typeof value !== "string") return null;
  const ip = value.trim();
  return isIP(ip) === 0 ? null : ip.toLowerCase();
}

/**
 * Qui l'on compte : l'acteur courant, posé par l'AuthGuard de Better Auth — la garde passe après
 * lui. L'IP du client ne sert que de repli, pour une route publique qui ne serait pas
 * `NoRateLimit` ; inconnue, tous ces clients partagent `ip:unknown` — un compteur commun plutôt
 * que pas de compteur.
 */
export function actorTracker(request: TrackedRequest, clientIpHeader: string | undefined): string {
  const id = request.user?.id;
  return typeof id === "string"
    ? `user:${id}`
    : `ip:${clientIp(request, clientIpHeader) ?? "unknown"}`;
}

/**
 * Un compteur par acteur et par politique, quelle que soit la route — la clé par défaut de la
 * librairie inclut la route, et « global » vaudrait alors 300 par route.
 */
export function actorKey(_context: ExecutionContext, tracker: string, name: string): string {
  return `${name}:${tracker}`;
}

/**
 * Vrai quand la route ne déclare pas `policy` : le compteur de cette politique ne la voit pas. La
 * route l'emporte sur son contrôleur, comme pour `RequireCapability`.
 */
export function outsidePolicy(policy: RateLimitPolicy) {
  return (context: ExecutionContext): boolean => {
    const declared =
      Reflect.getMetadata(RATE_LIMIT_POLICY_KEY, context.getHandler()) ??
      Reflect.getMetadata(RATE_LIMIT_POLICY_KEY, context.getClass());
    return declared !== policy;
  };
}

function policyThrottler(
  name: string,
  policy: RateLimitPolicy,
  limit: { ttl: number; limit: number },
): ThrottlerOptions {
  return { name, ...limit, generateKey: actorKey, skipIf: outsidePolicy(policy) };
}

/** `clientIpHeader` : `CLIENT_IP_HEADER`, l'en-tête que le proxy devant l'API écrit (#781). */
export function rateLimitOptions(clientIpHeader: string | undefined): ThrottlerModuleOptions {
  return {
    getTracker: (request) => actorTracker(request, clientIpHeader),
    // Les en-têtes de la librairie portent le nom du compteur (`Retry-After-global`), qu'aucun
    // client ne connaît : `RateLimitGuard` pose le `Retry-After` standard, sur le seul 429.
    setHeaders: false,
    // Le corps du 429 n'est jamais montré : chaque client traduit le statut (#782).
    errorMessage: "Trop de requêtes : réessaie dans un instant",
    throttlers: [
      { name: GLOBAL_THROTTLER, ...RATE_LIMITS.global, generateKey: actorKey },
      policyThrottler(
        POLICY_THROTTLERS.uploadPerMinute,
        RateLimitPolicy.UPLOAD,
        RATE_LIMITS.uploadPerMinute,
      ),
      policyThrottler(
        POLICY_THROTTLERS.uploadPerHour,
        RateLimitPolicy.UPLOAD,
        RATE_LIMITS.uploadPerHour,
      ),
      policyThrottler(POLICY_THROTTLERS.message, RateLimitPolicy.MESSAGE, RATE_LIMITS.message),
      policyThrottler(
        POLICY_THROTTLERS.invitation,
        RateLimitPolicy.INVITATION,
        RATE_LIMITS.invitation,
      ),
    ],
  };
}

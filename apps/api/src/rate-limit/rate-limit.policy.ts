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
 * global. La borne se compte par route : les quatre routes d'URL d'upload ont chacune la leur.
 */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY_KEY, policy);

/**
 * Sort la route de tout compteur. Réservé aux routes sans acteur qu'une machine appelle en boucle :
 * la sonde de santé, qu'un 429 ferait déclarer l'API morte, et le tick des rappels, gardé par son
 * propre secret.
 */
export const NoRateLimit = () => SkipThrottle({ [GLOBAL_THROTTLER]: true });

/**
 * Qui l'on compte : l'acteur courant, posé par l'AuthGuard de Better Auth — la garde passe après
 * lui. L'IP ne sert que de repli, pour une route publique qui ne serait pas `NoRateLimit` ; derrière
 * Cloudflare elle n'est pas fiable (#781), d'où ce rang de repli et pas plus.
 */
export function actorTracker(request: { user?: { id?: unknown } | null; ip?: string }): string {
  const id = request.user?.id;
  return typeof id === "string" ? `user:${id}` : `ip:${request.ip ?? "unknown"}`;
}

/** Un seul compteur par acteur pour toutes les routes — sans quoi « global » vaudrait par route. */
export function globalKey(_context: ExecutionContext, tracker: string, name: string): string {
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
  return { name, ...limit, skipIf: outsidePolicy(policy) };
}

export function rateLimitOptions(): ThrottlerModuleOptions {
  return {
    getTracker: actorTracker,
    // Les en-têtes de la librairie portent le nom du compteur (`Retry-After-global`), qu'aucun
    // client ne connaît : `RateLimitGuard` pose le `Retry-After` standard, sur le seul 429.
    setHeaders: false,
    // Le corps du 429 n'est jamais montré : chaque client traduit le statut (#782).
    errorMessage: "Trop de requêtes : réessaie dans un instant",
    throttlers: [
      { name: GLOBAL_THROTTLER, ...RATE_LIMITS.global, generateKey: globalKey },
      policyThrottler("upload-minute", RateLimitPolicy.UPLOAD, RATE_LIMITS.uploadPerMinute),
      policyThrottler("upload-hour", RateLimitPolicy.UPLOAD, RATE_LIMITS.uploadPerHour),
      policyThrottler("message", RateLimitPolicy.MESSAGE, RATE_LIMITS.message),
      policyThrottler("invitation", RateLimitPolicy.INVITATION, RATE_LIMITS.invitation),
    ],
  };
}

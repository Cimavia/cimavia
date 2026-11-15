import { redactUrlSecrets } from "@cmv/shared";
import type { Logger, TransportTargetOptions } from "pino";
import { type HttpLogger, type Options, pinoHttp } from "pino-http";

/**
 * Cibles de transport pino :
 * - console : JSON brut en prod (capté par l'hébergeur), pino-pretty en dev ;
 * - Axiom : activé dès que AXIOM_TOKEN + AXIOM_DATASET sont fournis (logs structurés distants),
 *   AXIOM_EDGE en option pour un dataset d'une région à domaine edge dédié.
 */
export function buildLogTargets(): TransportTargetOptions[] {
  const isProd = process.env.NODE_ENV === "production";
  const targets: TransportTargetOptions[] = [
    isProd
      ? { target: "pino/file", options: { destination: 1 } }
      : { target: "pino-pretty", options: { colorize: true } },
  ];

  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: "@axiomhq/pino",
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
        // Un dataset hors région par défaut refuse l'ingestion via api.axiom.co (400) : il exige
        // le domaine edge de sa région. Vide = domaine par défaut.
        ...(process.env.AXIOM_EDGE ? { edge: process.env.AXIOM_EDGE } : {}),
      },
    });
  }

  return targets;
}

/**
 * Ce qu'une ligne de journal dit d'une requête et de sa réponse : une LISTE BLANCHE (#294, #433).
 *
 * Les sérialiseurs par défaut recopiaient tous les en-têtes : le cookie de session Better Auth,
 * rejouable sept jours, à chaque requête authentifiée ; `authorization` ; le secret du tick de
 * rappels. Un `redact` sur ces chemins aurait laissé passer le prochain en-tête sensible, et il ne
 * sait pas réécrire une partie de l'URL — or le jeton d'un appareil est DANS le chemin.
 *
 * Elle couvre aussi les routes `/api/auth/*`, par `authRequestLogger` (#466) : elles ne passent pas
 * par le middleware de Nest, mais leurs lignes sortent des mêmes sérialiseurs — ni le cookie de la
 * requête, ni le `set-cookie` de la connexion, ni le `location` de la réinitialisation.
 *
 * Partent aussi : l'adresse et le port distants, donnée personnelle qu'aucun diagnostic n'a
 * demandée ; `query` et `params`, qui répètent l'URL AVANT blanchiment — `params.token` sur la
 * révocation d'un appareil.
 *
 * Ces sérialiseurs reçoivent la requête DÉJÀ passée par `pino-std-serializers` (pino-http les
 * enveloppe), d'où les champs `id`/`method`/`url` et non ceux de `IncomingMessage`. Ils valent
 * pour la ligne « request completed » comme pour toute ligne écrite pendant la requête, qui porte
 * `req` elle aussi.
 */
const serializers = {
  // `url` toujours présente : Fastify la renseigne sur toute requête, et pino-std-serializers la
  // recopie telle quelle.
  req: (req: { id?: unknown; method?: string; url: string }) => ({
    id: req.id,
    method: req.method,
    url: redactUrlSecrets(req.url),
  }),
  res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
};

/**
 * Le niveau de la ligne d'une requête (#697) : `error` pour une panne (statut ≥ 500, ou une erreur
 * que le serveur n'a pas su rendre), `warn` pour un refus (4xx), `info` sinon. Par défaut tout sortait
 * en `info` : un 503 se confondait avec un 200 dans Axiom.
 *
 * Le niveau `error` est aussi ce qui crée un événement chez Sentry (`pinoIntegration`) — voir
 * `sentry.config.ts`, qui écarte ces lignes-ci : le filtre d'exception a déjà capturé la même panne.
 */
export function requestLogLevel(
  _req: unknown,
  res: { statusCode: number },
  error?: Error,
): "error" | "warn" | "info" {
  if (res.statusCode >= 500 || (error && res.statusCode < 400)) return "error";
  return res.statusCode >= 400 ? "warn" : "info";
}

/**
 * Le `type` du problème que la réponse a rendu (#698), posé sur la réponse par le filtre
 * d'exception : un 4xx se lit par sa cause dans Axiom (`problemType = "urn:cimavia:problem:…"`),
 * sans rouvrir le corps de la réponse.
 */
export function requestLogProps(_req: unknown, res: object): { problemType?: string } {
  const { problemType } = res as { problemType?: string };
  return problemType === undefined ? {} : { problemType };
}

/**
 * Ce que dit la ligne d'une requête — liste blanche, niveau, cause — sans le logger qui l'écrit :
 * partagé par le middleware de Nest (`loggerOptions`) et par celui des routes d'auth
 * (`authRequestLogger`). Une seule définition, sans quoi les deux lignes divergeraient.
 */
function requestLogOptions(): Options {
  return {
    autoLogging: true,
    customLogLevel: requestLogLevel,
    customProps: requestLogProps,
    serializers,
  };
}

export function loggerOptions(): Options {
  return {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport: { targets: buildLogTargets() },
    ...requestLogOptions(),
  };
}

/**
 * La ligne de journal des routes `/api/auth/*` (#466), à passer en `middleware` du module Better
 * Auth : il l'appelle sur ces routes seules, juste avant de leur répondre.
 *
 * Il en faut un à part parce que `@thallesp/nestjs-better-auth` branche Better Auth par
 * `httpAdapter.use` PENDANT son `configure()`, et que Nest n'enregistre les middlewares déclarés
 * (celui de `nestjs-pino` compris) qu'APRÈS tous les `configure()`. Better Auth répond donc avant
 * eux, sans passer la main : aucun ordre d'import n'y change rien.
 *
 * `logger` est le logger racine de `nestjs-pino` : `pino-http` en tire un enfant, qui écrit dans le
 * même transport — pas de second worker vers Axiom. Même message (`request completed`, que le
 * filtre de Sentry reconnaît), même identifiant de requête (celui de Fastify, que middie recopie
 * sur la requête brute), même liste blanche. Better Auth ne rendant jamais la main, une requête
 * produit UNE ligne. Un preflight `OPTIONS` venu d'une origine de confiance n'en produit aucune :
 * le CORS du module y répond avant d'appeler ce middleware. Celui d'une autre origine, ou sans
 * origine, passe par lui et se journalise.
 *
 * Écart assumé : cet enfant, créé au démarrage, garde le niveau qu'avait la racine, quand les
 * lignes de Better Auth (`betterAuthLogging`) suivent son niveau courant. Aucun code ne le change
 * à chaud aujourd'hui ; le jour où ce sera le cas, la ligne de la requête restera au niveau du
 * démarrage.
 */
export function authRequestLogger(logger: Logger): HttpLogger {
  return pinoHttp({ ...requestLogOptions(), logger });
}

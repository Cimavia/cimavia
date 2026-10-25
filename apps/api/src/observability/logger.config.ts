import { redactUrlSecrets } from "@cmv/shared";
import type { TransportTargetOptions } from "pino";
import type { Options } from "pino-http";

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
 * Les routes `/api/auth/*` n'arrivent JAMAIS ici : Better Auth est branché directement sur
 * Fastify (`httpAdapter.use`), avant les middlewares de Nest, et répond sans passer la main. Ni la
 * connexion, ni le lien de réinitialisation, ni leurs `set-cookie` et `location` n'ont donc été
 * journalisés. La liste blanche les couvrirait le jour où ils le seraient.
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

export function loggerOptions(): Options {
  return {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport: { targets: buildLogTargets() },
    autoLogging: true,
    customLogLevel: requestLogLevel,
    customProps: requestLogProps,
    serializers,
  };
}

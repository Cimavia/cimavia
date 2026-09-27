import { redactUrlSecrets } from "@cmv/shared";
import type { TransportTargetOptions } from "pino";
import type { Options } from "pino-http";

/**
 * Cibles de transport pino :
 * - console : JSON brut en prod (capté par l'hébergeur), pino-pretty en dev ;
 * - Axiom : activé dès que AXIOM_TOKEN + AXIOM_DATASET sont fournis (logs structurés distants).
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
 * rappels ; et, en réponse, le `set-cookie` de la connexion et le `location` de la redirection de
 * réinitialisation, qui porte le jeton en clair. Un `redact` sur ces chemins aurait laissé passer
 * le prochain en-tête sensible, et il ne sait pas réécrire une partie de l'URL — or le jeton du
 * lien de réinitialisation et celui d'un appareil sont DANS le chemin.
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
  req: (req: { id?: unknown; method?: string; url?: string }) => ({
    id: req.id,
    method: req.method,
    url: req.url === undefined ? undefined : redactUrlSecrets(req.url),
  }),
  res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
};

export function loggerOptions(): Options {
  return {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport: { targets: buildLogTargets() },
    autoLogging: true,
    serializers,
  };
}

import { type EnvSchema, trimTrailingSlashes } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";

/**
 * Une page du client WEB que nomme un e-mail : `${WEB_URL}${path}`, ou `null` sans `WEB_URL`.
 *
 * `null` et non une URL relative ou par défaut : l'e-mail part quand même, sans le lien — la
 * consigne écrite suffit à s'en passer, une adresse inventée mènerait n'importe où.
 *
 * ⚠️ `path` est une route du routeur web (`apps/web/src/routes/`), que l'API ne connaît pas :
 * aucun test ne peut garantir qu'elle existe, et la renommer casse le lien EN SILENCE (dette I-2).
 * Chaque appelant cite le fichier de la route à côté du chemin — un `grep` le trouve.
 */
export function webPage(config: ConfigService<EnvSchema, true>, path: `/${string}`): string | null {
  const webUrl = config.get("WEB_URL", { infer: true });
  // `!webUrl` et non `== null` : vide dans l'environnement, `ConfigService` rend la chaîne brute de
  // `process.env` plutôt que l'`undefined` validé — le lien serait devenu un chemin sans hôte.
  return webUrl ? `${trimTrailingSlashes(webUrl)}${path}` : null;
}

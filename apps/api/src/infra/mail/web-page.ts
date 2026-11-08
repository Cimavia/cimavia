import { type EnvSchema, trimTrailingSlashes } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { webUrlOf } from "../../config/web-url";

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
  const webUrl = webUrlOf(config);
  return webUrl == null ? null : `${trimTrailingSlashes(webUrl)}${path}`;
}

import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";

/**
 * `WEB_URL` telle que l'API doit la lire : l'app web que nomment les e-mails, ou `null`.
 *
 * Une chaîne vide compte comme absente : le schéma la valide en `undefined`, mais `ConfigService`
 * retombe alors sur la valeur brute de `process.env` — `""`. Lue telle quelle, elle donnait des
 * liens sans hôte, et `new URL("")` levait au démarrage. Le seul endroit qui la lit : une parade
 * recopiée finirait par diverger.
 */
export function webUrlOf(config: ConfigService<EnvSchema, true>): string | null {
  return config.get("WEB_URL", { infer: true }) || null;
}

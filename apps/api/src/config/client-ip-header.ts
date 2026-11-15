import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";

/**
 * `CLIENT_IP_HEADER` telle que l'API doit la lire (#781) : l'en-tête qui porte l'IP du client, ou
 * `null` sans proxy devant l'API.
 *
 * Une chaîne vide compte comme absente, comme pour `webUrlOf` : le schéma la valide en `undefined`,
 * mais `ConfigService` retombe alors sur la valeur brute de `process.env` — `""`, la ligne même du
 * `.env.example`. Lue telle quelle, Better Auth cherchait l'en-tête `""` à chaque session ouverte,
 * et `Headers.get("")` lève : plus aucune connexion. Les deux lecteurs, Better Auth et le limiteur,
 * passent par ici.
 */
export function clientIpHeaderOf(config: ConfigService<EnvSchema, true>): string | null {
  return config.get("CLIENT_IP_HEADER", { infer: true }) || null;
}

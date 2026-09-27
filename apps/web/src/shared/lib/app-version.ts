import { formatAppVersion } from "@cmv/shared";
import { runtimeConfig } from "./runtime-config";

/**
 * Ce que le pied de l'écran de compte affiche (#187).
 *
 * Deux moitiés qui ne viennent pas du même endroit (#417) : la VERSION est figée dans le bundle au
 * build — elle ne change pas d'un tier à l'autre, c'est le même bundle retagué —, le TIER est lu
 * dans `config.js`, servi par le conteneur au démarrage.
 *
 * Lu À L'APPEL et non au chargement du module : un test qui veut éprouver une autre valeur la pose
 * (`vi.stubEnv`, `window.__CMV_CONFIG__`) sans avoir à réimporter ce fichier.
 *
 * Ni l'une ni l'autre n'a de défaut (règle dure n°5). Un tier absent ne s'affiche jamais en
 * pratique — `main.tsx` refuse de monter l'app sans lui —, mais ce n'est pas une raison pour en
 * inventer un ici.
 */
export function appVersionLabel(): string | null {
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null;
  const { tier } = runtimeConfig();
  if (tier === null) return null;

  return formatAppVersion(version, tier);
}

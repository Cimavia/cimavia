import { type AppTier, isAppTier } from "@cmv/shared";

/**
 * Ce qui dépend du TIER et non de la version (#417) : l'API à joindre, le projet Sentry, le nom du
 * tier. Rien de tout cela n'est figé dans le bundle — le même bundle part sur preview puis en
 * production, retagué et jamais reconstruit (« Tranché en #186 »). Le conteneur nginx sert
 * `/config.js` depuis son environnement, et `index.html` le charge AVANT le bundle.
 *
 * Tout ce qui est ici part chez chaque visiteur, comme le bundle avant lui : aucun secret n'y a sa
 * place. L'image n'y laisse passer que les variables `CMV_*` (`NGINX_ENVSUBST_FILTER`).
 *
 * Chaque champ vaut `null` quand il est absent ou invalide, jamais une valeur par défaut (règle dure
 * n°5) : l'ancien repli sur `http://localhost:3000` faisait appeler le poste du Coach par son propre
 * navigateur, sans rien dire. C'est `main.tsx` qui décide quoi faire d'un `null`.
 */
export type RuntimeConfig = {
  apiUrl: string | null;
  tier: AppTier | null;
  /** `null` veut dire « pas de Sentry sur ce tier », pas « indisponible » : le SDK reste inerte. */
  sentryDsn: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Une URL absolue en http(s) : un chemin relatif ou un `javascript:` ne désignent pas une API. */
function httpUrl(value: unknown): string | null {
  const url = nonEmptyString(value);
  if (url === null || !URL.canParse(url)) return null;

  const { protocol } = new URL(url);
  return protocol === "http:" || protocol === "https:" ? url : null;
}

/**
 * Lu À L'APPEL, pas au chargement du module : un test pose une autre configuration sans avoir à
 * réimporter ce fichier. `window.__CMV_CONFIG__` est absent si `/config.js` n'a pas été servi.
 */
export function runtimeConfig(): RuntimeConfig {
  const raw: unknown = window.__CMV_CONFIG__;
  const fields = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  return {
    apiUrl: httpUrl(fields.apiUrl),
    tier: isAppTier(fields.tier) ? fields.tier : null,
    sentryDsn: nonEmptyString(fields.sentryDsn),
  };
}

/**
 * Ce qui manque pour que l'app puisse démarrer, en clair : c'est le message que Sentry et la
 * console reçoivent. Vide, l'app peut démarrer.
 */
export function missingRuntimeConfig(config: RuntimeConfig): string[] {
  const missing: string[] = [];
  if (config.apiUrl === null) missing.push("CMV_API_URL");
  if (config.tier === null) missing.push("CMV_APP_ENV");
  return missing;
}

/**
 * L'URL de l'API pour les clients `api` et `auth`, construits à l'import de leur module. Ils ne
 * sont importés qu'après la vérification de `main.tsx` : lever ici veut dire que cet ordre a été
 * cassé, et le dire vaut mieux que d'appeler une URL inventée.
 */
export function requireApiUrl(): string {
  const { apiUrl } = runtimeConfig();
  if (apiUrl === null) throw new Error("config.js ne fournit pas CMV_API_URL");
  return apiUrl;
}

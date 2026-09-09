/**
 * Le tier tel que chaque client sait le nommer (#187).
 *
 * Quatre valeurs et non trois : le web lit `VITE_APP_ENV` (`development | staging | production`,
 * aligné sur l'`APP_ENV` de l'API) tandis que le mobile lit `Constants.expoConfig.extra.appVariant`
 * (`development | preview | production`, posé par `app.config.ts`). `preview` n'existe que côté
 * mobile, `staging` que côté web — et cette divergence est ASSUMÉE : ce sont deux chaînes de
 * livraison différentes, un build EAS interne n'étant pas un déploiement de serveur. L'union les
 * accueille toutes deux plutôt que d'inventer un vocabulaire commun que personne n'émettrait.
 */
export type AppTier = "development" | "preview" | "staging" | "production";

// i18n-exempt : ce ne sont pas des libellés traduisibles mais des noms de tiers, les mêmes dans
// toutes les langues — « dev » ne se traduit pas plus que « staging ».
const TIER_SUFFIX: Record<AppTier, string | null> = {
  development: "dev",
  preview: "preview",
  staging: "staging",
  production: null,
};

/**
 * Ce qui s'affiche en pied d'écran de compte : `1.2.0 (dev)` hors production, `1.2.0` en
 * production.
 *
 * Rend `null` — jamais `"—"` ni `"0.0.0"` — quand la version n'a pas été injectée : hors image, il
 * n'y a PAS de version, et c'est au rendu de dire l'absence (règle dure n°5). Les deux écrans
 * affichent `—`, comme partout ailleurs dans le produit.
 *
 * Le suffixe vient du TIER, jamais d'un test sur le numéro. Deviner « c'est du dev parce que ça
 * finit par 0 » remarcherait quelques semaines puis mentirait, et la production est le seul tier
 * où le suffixe se tait — parce que c'est le seul où l'utilisateur n'a pas à se demander où il est.
 */
export function formatAppVersion(version: string | null, tier: AppTier): string | null {
  if (version == null || version === "") return null;

  const suffix = TIER_SUFFIX[tier];
  return suffix == null ? version : `${version} (${suffix})`;
}

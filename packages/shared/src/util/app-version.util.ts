/**
 * Le tier, le même mot sur les trois couches (#261).
 *
 * Le web le lit dans `config.js`, servi au démarrage de son conteneur (#417), l'API dans
 * `APP_ENV`, le mobile dans `Constants.expoConfig.extra.appVariant` (posé par `app.config.ts`) :
 * trois lectures, un seul vocabulaire. #187 en avait assumé deux — `staging` pour un déploiement
 * de serveur, `preview` pour un build EAS interne qui pointait sur le NAS — parce que c'étaient
 * deux chaînes de livraison. Le NAS retiré, le build `preview` pointe sur l'environnement preview :
 * il ne reste qu'une chaîne, et un environnement qui porte deux noms selon qui le lit finit par en
 * porter trois.
 */
const APP_TIERS = ["development", "preview", "production"] as const;
export type AppTier = (typeof APP_TIERS)[number];

/**
 * Le garde de ce qui arrive de l'extérieur sans type — le `config.js` du web (#417). Il ne répare
 * rien : une valeur hors de la liste est refusée, pas ramenée à `development` (règle dure n°5).
 */
export function isAppTier(value: unknown): value is AppTier {
  return APP_TIERS.includes(value as AppTier);
}

// i18n-exempt : ce ne sont pas des libellés traduisibles mais des noms de tiers, les mêmes dans
// toutes les langues — « dev » ne se traduit pas plus que « preview ».
const TIER_SUFFIX: Record<AppTier, string | null> = {
  development: "dev",
  preview: "preview",
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

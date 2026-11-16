/**
 * Le bundle que la page EXÉCUTE est-il encore celui que le serveur SERT (#290) ?
 *
 * L'identité comparée est le `src` du script d'entrée — `/assets/index-<hash>.js` —, et non une
 * version publiée à part (« Tranché en #290 ») :
 * - le hash change exactement quand le bundle change, sans étape de build ni fichier de plus ;
 * - il est déjà public dans `index.html` : rien n'expose la version, que « Tranché en #186 » garde
 *   derrière une session ;
 * - la référence est le DOM de la page, pas une première lecture au démarrage. Un onglet restauré
 *   depuis le cache du navigateur relirait sinon la version NEUVE au premier `fetch`, la prendrait
 *   pour la sienne, et ne verrait jamais qu'il est périmé.
 *
 * Le CSS n'est pas comparé : un déploiement change toujours le numéro de version, qui vit dans le
 * chunk `app`, et le nom de ce chunk est écrit dans l'entrée — dont le hash change donc avec lui
 * (vérifié : deux builds `1.0.0` et `1.0.1` du même code, deux entrées, une même feuille de style).
 */

/**
 * Le `src` du script MODULE servi depuis `/assets/` — le bundle de Vite —, tel qu'écrit :
 * `getAttribute` et non `.src`, qui le rendrait absolu côté DOM et pas côté HTML parsé.
 *
 * `/assets/` et pas le premier module venu : une extension du navigateur peut injecter le sien
 * dans la page, qui ne serait jamais dans l'`index.html` servi — l'invite s'afficherait sans
 * déploiement. En dev, l'entrée est `/src/main.tsx` : `null`, et la détection ne fait rien.
 */
export function entryScriptIn(root: ParentNode): string | null {
  return root.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute("src") ?? null;
}

/**
 * Le script d'entrée de l'`index.html` que sert le serveur À L'INSTANT.
 *
 * `no-store` : sans lui le navigateur relirait son propre cache, et la détection dormirait comme
 * le HTML qu'elle surveille. nginx sert déjà `index.html` en `no-cache`.
 *
 * `null` sur toute panne — réseau coupé, statut d'erreur, redirection (une session Cloudflare
 * Access expirée renvoie vers sa page de connexion, qui n'est pas l'app) : « je ne sais pas »,
 * jamais « nouvelle version ».
 */
export async function servedEntryScript(): Promise<string | null> {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    if (!response.ok || response.redirected) return null;

    const html = await response.text();
    return entryScriptIn(new DOMParser().parseFromString(html, "text/html"));
  } catch {
    return null;
  }
}

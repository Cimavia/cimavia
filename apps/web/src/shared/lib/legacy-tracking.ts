/** Le suivi par exercice, une entrée par séance — parti avec son modèle en #723. */
const LEGACY_PREFIX = "cimavia-tracking:";

/**
 * Efface ce que l'ancien modèle d'exercice a laissé dans le navigateur (#723). Plus rien ne le lit :
 * des coches d'une séance qu'aucun écran ne rouvrira.
 *
 * Passée au montage de l'app : une fois vide, il ne reste qu'un parcours des clés. Le suivi par
 * bloc a son propre préfixe (`cimavia-block-tracking:`), que le filtre ne touche pas.
 */
export function purgeLegacyTracking(): void {
  try {
    const storage = window.localStorage;
    // Relevées d'abord : retirer une clé pendant le parcours décalerait les index.
    const legacy = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(LEGACY_PREFIX) === true,
    );
    for (const key of legacy) storage.removeItem(key);
  } catch {
    // Stockage indisponible (navigation privée, politique du navigateur) : rien à purger d'utile.
  }
}

import AsyncStorage from "@react-native-async-storage/async-storage";

/** Le suivi par exercice, une entrée par séance, et le drapeau de son astuce — partis en #723. */
const LEGACY_PREFIX = "cimavia-tracking:";
const LEGACY_HINT = "cimavia-tracking-hint-seen";

/**
 * Efface ce que l'ancien modèle d'exercice a laissé sur l'appareil (#723). Plus rien ne le lit :
 * ces entrées ne feraient qu'occuper le disque, et des coches d'une séance qu'aucun écran ne
 * rouvrira.
 *
 * Passée à chaque démarrage, à l'import (comme le mode audio) : une fois vide, il ne reste qu'une
 * lecture des clés. Le suivi par bloc a son propre préfixe (`cimavia-block-tracking:`), que le
 * filtre ne touche pas.
 */
export async function purgeLegacyTracking(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const legacy = keys.filter((key) => key.startsWith(LEGACY_PREFIX) || key === LEGACY_HINT);
  if (legacy.length > 0) await AsyncStorage.multiRemove(legacy);
}

purgeLegacyTracking().catch(() => {
  // Best-effort : une purge manquée sera rejouée au prochain démarrage.
});

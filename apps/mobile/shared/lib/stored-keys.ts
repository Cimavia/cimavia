import AsyncStorage from "@react-native-async-storage/async-storage";

/** Retire du stockage local les entrées dont la clé répond au filtre. */
export async function removeStoredKeys(matches: (key: string) => boolean): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const matching = keys.filter(matches);
  if (matching.length > 0) await AsyncStorage.multiRemove(matching);
}

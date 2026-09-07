import * as SecureStore from "expo-secure-store";

/**
 * Secret d'installation du push (#90) — ce que l'appareil garde pour prouver, le jour où il change
 * de compte, qu'il est bien la même installation que celle qui portait déjà le token.
 *
 * C'est l'API qui l'émet, une seule fois, et qui n'en garde que l'empreinte : perdre ce qui suit,
 * c'est perdre la capacité à réaffecter l'appareil. D'où `expo-secure-store`, comme le cookie de
 * session — un `AsyncStorage` en clair aurait rendu le secret lisible par qui accède au stockage
 * de l'app, c'est-à-dire par le seul attaquant que #90 cherche à arrêter.
 */
const INSTALLATION_SECRET_KEY = "cmv.push.installation-secret";

/**
 * `null` quand il n'y en a pas ENCORE (première installation, ou app d'avant #90) comme quand le
 * stockage est indisponible — dans les deux cas l'API réémettra, et c'est la seule réponse juste :
 * inventer une valeur de repli ferait refuser un appareil légitime (règle n°5).
 */
export async function readInstallationSecret(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(INSTALLATION_SECRET_KEY);
  } catch {
    return null;
  }
}

/**
 * Silencieux à l'échec, par choix : le token vient d'être enregistré, l'appareil recevra ses
 * notifications. Ce qui se perd est la prochaine réaffectation — que l'API sait rattraper en
 * réémettant, puisque la session prouve à qui la ligne appartient.
 */
export async function storeInstallationSecret(secret: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(INSTALLATION_SECRET_KEY, secret);
  } catch {
    // cf. ci-dessus — jamais de quoi faire échouer un démarrage d'app.
  }
}

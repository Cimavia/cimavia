import { purgeAllDocuments } from "@/shared/lib/document-cache";
import { resetQueryCache } from "@/shared/lib/query";

/**
 * Efface TOUT ce que l'appareil garde du compte quitté : le cache de requêtes et les documents
 * descendus pour la lecture hors-ligne (#95).
 *
 * POURQUOI un point d'entrée unique. Le cache de requêtes seul avait déjà laissé fuiter les
 * athlètes, débriefs, messages et factures d'un compte vers le suivant, parce que rien ne le
 * vidait au changement — et ce qui manquait alors n'était pas le geste mais l'endroit où le
 * mettre. Le magasin de documents pose exactement le même risque, en plus lisible : un PDF
 * d'entraînement s'ouvre, là où une entrée AsyncStorage se lit mal. Deux appels séparés dans
 * trois écrans, c'est six occasions d'en oublier un ; celui-ci n'en laisse qu'une.
 *
 * Les fichiers d'abord : la purge du disque ne lève jamais (elle avale ses propres échecs), là où
 * `resetQueryCache` touche AsyncStorage. L'ordre garantit que les documents partent même si le
 * cache de requêtes, lui, résiste.
 */
export async function resetAccountData(): Promise<void> {
  purgeAllDocuments();
  await resetQueryCache();
}

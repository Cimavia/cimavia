import { purgeAllDocuments } from "@/shared/lib/document-cache";
import { resetQueryCache } from "@/shared/lib/query";
import { purgeVideoThumbnails } from "@/shared/lib/video-thumbnail";

/**
 * Efface TOUT ce que l'appareil garde du compte quitté : le cache de requêtes, les documents
 * descendus pour la lecture hors-ligne (#95) et les vignettes des vidéos (#92).
 *
 * POURQUOI un point d'entrée unique. Le cache de requêtes seul avait déjà laissé fuiter les
 * athlètes, débriefs, messages et factures d'un compte vers le suivant, parce que rien ne le
 * vidait au changement — et ce qui manquait alors n'était pas le geste mais l'endroit où le
 * mettre. Le magasin de documents pose exactement le même risque, en plus lisible : un PDF
 * d'entraînement s'ouvre, là où une entrée AsyncStorage se lit mal. Deux appels séparés dans
 * trois écrans, c'est six occasions d'en oublier un ; celui-ci n'en laisse qu'une.
 *
 * Les fichiers d'abord : les purges du disque ne lèvent jamais (elles avalent leurs propres
 * échecs), là où `resetQueryCache` touche AsyncStorage. L'ordre garantit que documents et vignettes
 * partent même si le cache de requêtes, lui, résiste.
 */
export async function resetAccountData(): Promise<void> {
  purgeAllDocuments();
  purgeVideoThumbnails();
  await resetQueryCache();
}

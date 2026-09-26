import { createSignedUrlSharing } from "@cmv/shared";
import { replaceEqualDeep } from "@tanstack/react-query";

/**
 * La mémoire des URLs signées du mobile, UNE pour toute l'app (#304) : le fil, le débrief et la
 * re-signature avant ouverture doivent voir la même URL pour le même média. La règle et son
 * pourquoi vivent dans `@cmv/shared` (`signed-url-keeper.util`) ; ce module ne fait que la poser.
 *
 * Elle vit en MÉMOIRE, pas dans le cache persisté : au démarrage, elle est vide, et un média
 * inconnu vaut « périmé ». C'est ce qui oblige `query.tsx` à faire recharger, après restauration,
 * les requêtes qui portent des médias — voir `SIGNED_MEDIA_QUERY_ROOTS`.
 */
// L'horloge est lue à l'APPEL, pas capturée au chargement du module : c'est ce qui laisse un test
// la simuler (`vi.useFakeTimers`) après l'import.
export const {
  keeper: signedUrlKeeper,
  keepThreadUrls,
  keepFeedbackUrls,
} = createSignedUrlSharing(replaceEqualDeep, () => Date.now());

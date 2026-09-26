import { createSignedUrlSharing } from "@cmv/shared";
import { replaceEqualDeep } from "@tanstack/react-query";

/**
 * La mémoire des URLs signées du web, UNE pour toute l'app (#304) : le fil, le débrief et la
 * re-signature d'un lecteur doivent voir la même URL pour le même média. La règle et son pourquoi
 * vivent dans `@cmv/shared` (`signed-url-keeper.util`) ; ce module ne fait que la poser.
 */
export const {
  keeper: signedUrlKeeper,
  keepThreadUrls,
  keepFeedbackUrls,
} = createSignedUrlSharing(replaceEqualDeep, Date.now);

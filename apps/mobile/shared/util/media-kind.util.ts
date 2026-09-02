import { MediaType, type MediaTypeType } from "@cmv/shared";
import type { ImagePickerAsset } from "expo-image-picker";

/**
 * La famille d'un média choisi dans la galerie, telle que la PRÉPARATION la lira ensuite (les deux
 * `prepareMedia`/`prepareAsset` aiguillent sur `asset.type === "video"`).
 *
 * Ici, contrairement au web, la fonction est TOTALE : le picker ne rend que des images et des
 * vidéos, il n'existe pas d'asset qu'on ne saurait pas joindre. Deux lectures différentes feraient
 * qu'un média occupe une place de photo et se prépare comme une vidéo.
 */
export function assetMediaKind(asset: ImagePickerAsset): MediaTypeType {
  return asset.type === "video" ? MediaType.VIDEO : MediaType.IMAGE;
}

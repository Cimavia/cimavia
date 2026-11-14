import { imageMediaIds, RichBlockType, type RichDocument } from "@cmv/shared";
import { isPendingMediaId, type PendingImage } from "@/feature/library/hook/useInstructionMedia";

/**
 * Les images en attente que la consigne cite ENCORE — les seules à envoyer (#330).
 *
 * Le magasin ne rétrécit pas quand le Coach retire une image : un Ctrl+Z la remet dans le
 * document, et elle doit pouvoir partir. C'est donc la consigne, au moment d'enregistrer, qui dit
 * ce qui part. Sans ce filtre, une image retirée était envoyée et rattachée quand même, invisible
 * dans la consigne comme dans les pièces jointes, et recopiée dans chaque séance planifiée.
 */
export function citedPendingImages(
  blocks: RichDocument,
  pending: readonly PendingImage[],
): PendingImage[] {
  const cited = new Set(imageMediaIds(blocks));
  return pending.filter((image) => cited.has(image.mediaId));
}

/**
 * Réécrit les ids provisoires en ids définitifs. Une image pas encore envoyée — ou dont l'envoi a
 * échoué — n'a pas d'entrée dans la table : elle est retirée plutôt que laissée en référence morte.
 *
 * Sert aussi au PREMIER enregistrement, avec les seules images déjà envoyées : écrire un id
 * provisoire produirait une référence morte si l'envoi échouait ensuite, et la consigne
 * afficherait un trou que rien ne saurait réparer.
 */
export function withResolvedImages(
  blocks: RichDocument,
  idByPendingId: ReadonlyMap<string, string>,
): RichDocument {
  return blocks.flatMap((block) => {
    if (block.type !== RichBlockType.IMAGE || !isPendingMediaId(block.mediaId)) return [block];
    const documentId = idByPendingId.get(block.mediaId);
    return documentId == null ? [] : [{ ...block, mediaId: documentId }];
  });
}

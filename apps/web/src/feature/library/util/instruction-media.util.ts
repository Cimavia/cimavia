import { RichBlockType, type RichDocument } from "@cmv/shared";
import { isPendingMediaId } from "@/feature/library/hook/useInstructionMedia";

/** Vrai si au moins une image attend encore son envoi — évite un second PATCH pour rien. */
export function hasPendingImages(blocks: RichDocument): boolean {
  return blocks.some(
    (block) => block.type === RichBlockType.IMAGE && isPendingMediaId(block.mediaId),
  );
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

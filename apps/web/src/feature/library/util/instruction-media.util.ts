import { RichBlockType, type RichDocument } from "@cmv/shared";
import { isPendingMediaId } from "@/feature/library/hook/useInstructionMedia";

/**
 * Le document débarrassé de ses images pas encore envoyées.
 *
 * Sert au PREMIER enregistrement d'un exercice, avant que les fichiers n'aient d'`ExerciseDocument`
 * à référencer. Écrire les ids provisoires produirait des références mortes si l'envoi échouait
 * ensuite : la consigne afficherait des trous que rien ne saurait réparer.
 */
export function withoutPendingImages(blocks: RichDocument): RichDocument {
  return blocks.filter(
    (block) => block.type !== RichBlockType.IMAGE || !isPendingMediaId(block.mediaId),
  );
}

/** Vrai si au moins une image attend encore son envoi — évite un second PATCH pour rien. */
export function hasPendingImages(blocks: RichDocument): boolean {
  return blocks.some(
    (block) => block.type === RichBlockType.IMAGE && isPendingMediaId(block.mediaId),
  );
}

/**
 * Réécrit les ids provisoires en ids définitifs. Une image dont l'envoi a échoué n'a pas
 * d'entrée dans la table : elle est retirée plutôt que laissée en référence morte.
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

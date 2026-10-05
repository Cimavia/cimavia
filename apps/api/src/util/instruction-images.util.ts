import {
  DocumentType,
  DocumentUsage,
  imageMediaIds,
  RichBlockType,
  type RichDocument,
  remapImageMediaIds,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import type { DocumentRow } from "../infra/storage/document.mapper";

/** Ce qu'il faut savoir d'un document pour dire s'il peut être une image de consigne. */
export type InstructionDocument = Pick<DocumentRow, "id" | "type" | "usage">;

/**
 * Les documents qu'une consigne peut citer : les fichiers d'usage `INSTRUCTION`. Une pièce jointe
 * ou un lien, même rattachés à la ligne, n'en sont pas — le client les liste à part, et une image
 * qui y renverrait apparaîtrait deux fois chez l'athlète.
 */
export function instructionImageIds(documents: readonly InstructionDocument[]): Set<string> {
  return new Set(
    documents
      .filter((doc) => doc.type === DocumentType.FILE && doc.usage === DocumentUsage.INSTRUCTION)
      .map((doc) => doc.id),
  );
}

/**
 * Refuse (400) une consigne qui cite une image que la ligne écrite ne porte pas.
 *
 * Le `mediaId` vient du client : c'est une référence entrante, à prouver possédée comme une clé
 * étrangère (`architecture-choice.md` §6, piège n°3). Sans ce contrôle, une consigne pouvait citer
 * le document d'un autre exercice — celui d'une source recopiée en variante, typiquement — et
 * l'image manquait ensuite partout, sans un message (#315). Le scope tenant protégeait déjà le
 * document d'un autre coach : la référence restait morte, elle ne lisait rien.
 *
 * `undefined` et `null` passent : ne pas toucher à la consigne, ou l'effacer, ne cite rien.
 */
export function assertInstructionImagesOwned(
  instructions: RichDocument | null | undefined,
  documents: readonly InstructionDocument[],
): void {
  if (instructions == null) return;
  const owned = instructionImageIds(documents);
  if (imageMediaIds(instructions).some((mediaId) => !owned.has(mediaId))) {
    throw new BadRequestException("La consigne cite une image qui n'appartient pas à cet exercice");
  }
}

/**
 * La consigne d'une copie : chaque image réécrite vers l'identifiant de son document recopié.
 *
 * Une image dont le document n'a PAS été recopié est retirée, pas gardée sous son ancien
 * identifiant : elle désignerait le document d'une autre ligne, que rien ne résout — un trou dans
 * la consigne, sans un message (#315). Elle ne s'affichait déjà pas à la source.
 *
 * Un document vide vaut `null`, jamais `[]` (règle nullable n°5).
 */
export function withCopiedImages(
  instructions: RichDocument,
  idByOldId: ReadonlyMap<string, string>,
): RichDocument | null {
  const copied = instructions.filter(
    (block) => block.type !== RichBlockType.IMAGE || idByOldId.has(block.mediaId),
  );
  return copied.length === 0 ? null : remapImageMediaIds(copied, idByOldId);
}

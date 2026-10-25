import { required, type SessionBlock } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { toJsonInput } from "../util/block-json.util";
import { type BlockContent, blockContentOf } from "./session-block.mapper";

/** Les colonnes du contenu d'un bloc, écrites de la même façon aux deux niveaux. */
export function toBlockContentData(block: BlockContent) {
  const content = blockContentOf(block);
  return {
    ...content,
    settings: toJsonInput(content.settings),
    copiedSettings: toJsonInput(content.copiedSettings),
  };
}

/**
 * Écrit la composition par blocs d'une séance (#716) : ses blocs, puis leurs exercices d'un seul
 * `createMany`. La séance n'a plus rien d'autre — l'appelant a effacé sa composition d'avant, des
 * deux modèles.
 *
 * Les blocs naissent sous des identifiants NEUFS : celui que le client envoie ne sert qu'à
 * distinguer ses blocs dans l'envoi. Repris tel quel, il laisserait le client choisir la clé
 * primaire d'une ligne, et heurter celle d'une autre séance. Les exercices gardent leur `key`, qui
 * est la seule identité que la séance planifiée recopie.
 *
 * `position` reste unique dans la séance, comme pour l'ancien modèle : c'est le rang de l'exercice
 * dans toute la séance, bloc après bloc.
 */
export async function insertSessionBlocks(
  tx: TenantTx,
  sessionId: string,
  blocks: readonly SessionBlock[],
): Promise<void> {
  // Lancés ensemble : la connexion de la transaction les passe de toute façon un par un.
  const created = await Promise.all(
    blocks.map((block, position) =>
      tx.sessionBlock.create({
        // coachId injecté par la couche d'isolation : celui de la séance (piège n°7).
        data: {
          sessionId,
          position,
          ...toBlockContentData(block),
        } satisfies Omit<
          Prisma.SessionBlockUncheckedCreateInput,
          "coachId"
        > as Prisma.SessionBlockUncheckedCreateInput,
        select: { id: true },
      }),
    ),
  );
  const rows = blocks.flatMap((block, index) =>
    block.exercises.map((exercise, blockPosition) => ({
      sessionId,
      exerciseId: exercise.exerciseId,
      note: exercise.note,
      blockId: required(created[index], "[séance] un bloc créé par bloc envoyé").id,
      blockPosition,
      key: exercise.key,
      grid: toJsonInput(exercise.grid),
    })),
  );
  if (rows.length === 0) return;
  await tx.sessionExercise.createMany({
    data: rows.map((row, position) => ({ ...row, position })) satisfies Omit<
      Prisma.SessionExerciseUncheckedCreateInput,
      "coachId"
    >[] as Prisma.SessionExerciseUncheckedCreateInput[],
  });
}

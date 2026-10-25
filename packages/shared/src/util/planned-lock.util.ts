import { type BlockGrid, sameGridMetrics } from "../dto/block-grid.schema";
import { CompositionOrigin, type ScheduledBlockExercise } from "../dto/session-block.schema";
import type { StructureSettings } from "../dto/structure.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { required } from "./invariant.util";
import { isCustomized } from "./structure-settings.util";

// Le verrou du niveau planifié (#716) : ce qu'une séance planifiée ne peut pas changer au bloc
// qu'elle a reçu. Les VALEURS — tours, repos, cellules — et la COMPOSITION — ajouter, retirer,
// remplacer un exercice — restent libres ; elles se comptent (`plannedChanges`).
//
// Aucune route de #716 n'écrit un bloc planifié : le verrou est livré pur, et les écritures de
// composition (#720) et de valeurs (#721) le vérifient côté serveur, contre la référence STOCKÉE.

/** Le bloc reçu : son nom, que rien ne réécrit, et sa référence (`baseline`). */
type ReferenceBlock = {
  name: string;
  settings: StructureSettings;
  exercises: readonly { key: string; grid: BlockGrid }[];
};
type PlannedExercise = Pick<ScheduledBlockExercise, "key" | "origin"> & { grid: BlockGrid };
type PlannedBlock = {
  name: string;
  settings: StructureSettings;
  exercises: readonly PlannedExercise[];
};

export const PlannedLock = {
  /** Les blocs se répondent par leur rang : leur nombre ne bouge pas. */
  BLOCK_COUNT: "BLOCK_COUNT",
  NAME: "NAME",
  /** Les réponses des réglages (`settingsShape`), pas leurs nombres. */
  SETTINGS: "SETTINGS",
  /** L'ordre relatif des exercices reçus. */
  ORDER: "ORDER",
  /** Les colonnes d'un exercice reçu. */
  COLUMNS: "COLUMNS",
} as const;
export type PlannedLock = TypesValuesOf<typeof PlannedLock>;

export type PlannedLockIssue =
  | { lock: typeof PlannedLock.BLOCK_COUNT }
  | {
      lock: typeof PlannedLock.NAME | typeof PlannedLock.SETTINGS | typeof PlannedLock.ORDER;
      blockIndex: number;
    }
  | { lock: typeof PlannedLock.COLUMNS; blockIndex: number; key: string };

/**
 * Ce qu'une séance planifiée change de verrouillé par rapport à ce qu'elle a reçu, bloc par bloc.
 *
 * - « L'ordre des exercices » se lit en deux : le réglage `order`, qui fait partie des réglages, et
 *   l'ordre RELATIF des exercices reçus. Un ajout ou un remplaçant se glisse où il veut ; deux
 *   exercices reçus ne s'échangent pas.
 * - Les colonnes d'un exercice reçu sont celles de la référence : une colonne en plus ou en moins
 *   changerait ce qui se compare tour par tour. Un remplaçant arrive avec les siennes.
 * - Un exercice reçu que la référence n'a plus n'a rien à quoi se comparer : il n'est pas
 *   verrouillé, comme `plannedChanges` le compte en ajout.
 */
export function plannedLockIssues(
  reference: readonly ReferenceBlock[],
  planned: readonly PlannedBlock[],
): PlannedLockIssue[] {
  if (reference.length !== planned.length) return [{ lock: PlannedLock.BLOCK_COUNT }];
  // Longueurs égales juste au-dessus : chaque bloc a son homologue au même rang.
  return planned.flatMap((block, blockIndex) =>
    blockLockIssues(
      blockIndex,
      // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
      required(reference[blockIndex], "bloc de référence absent"),
      block,
    ),
  );
}

function blockLockIssues(
  blockIndex: number,
  reference: ReferenceBlock,
  block: PlannedBlock,
): PlannedLockIssue[] {
  const issues: PlannedLockIssue[] = [];
  if (block.name !== reference.name) issues.push({ lock: PlannedLock.NAME, blockIndex });
  if (isCustomized(block.settings, reference.settings)) {
    issues.push({ lock: PlannedLock.SETTINGS, blockIndex });
  }

  const rankOf = new Map(reference.exercises.map((exercise, rank) => [exercise.key, rank]));
  const received = block.exercises.flatMap((exercise) => {
    const rank = rankOf.get(exercise.key);
    return exercise.origin.kind === CompositionOrigin.RECEIVED && rank != null
      ? [{ exercise, rank }]
      : [];
  });
  // Les exercices reçus suivent l'ordre de la référence : leurs rangs y sont déjà triés.
  const ranks = received.map(({ rank }) => rank);
  const sorted = [...ranks].sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== sorted[index])) {
    issues.push({ lock: PlannedLock.ORDER, blockIndex });
  }
  for (const { exercise, rank } of received) {
    // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
    const base = required(reference.exercises[rank], "exercice de référence absent");
    if (!sameGridMetrics(base.grid.metrics, exercise.grid.metrics)) {
      issues.push({ lock: PlannedLock.COLUMNS, blockIndex, key: exercise.key });
    }
  }
  return issues;
}

/**
 * Les clés des exercices NOUVEAUX — ajouts et remplaçants — que la séance-type a déjà. `taken`
 * réunit les clés de la référence de chaque bloc et celles de la séance-type courante.
 *
 * Une clé se recopie d'un niveau à l'autre, et c'est par elle qu'ils se comparent : un remplaçant
 * qui reprendrait la clé de l'exercice retiré se lirait comme lui, et le retrait comme le
 * remplacement compteraient la même place (#715).
 */
export function takenKeys(
  planned: readonly { exercises: readonly Pick<ScheduledBlockExercise, "key" | "origin">[] }[],
  taken: Iterable<string>,
): string[] {
  const known = new Set(taken);
  return planned.flatMap((block) =>
    block.exercises
      .filter(
        (exercise) =>
          exercise.origin.kind !== CompositionOrigin.RECEIVED && known.has(exercise.key),
      )
      .map((exercise) => exercise.key),
  );
}

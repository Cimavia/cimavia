import type { ScheduledSessionDto, ScheduledSessionExerciseDto } from "../dto/plan.schema";
import type { ScheduledSessionBlockDto } from "../dto/session-block-dto.schema";
import { blockNumbers, exerciseCodes, exerciseLabels } from "./block-reading.util";
import { required } from "./invariant.util";

// La séance planifiée telle que l'athlète la lit, bloc par bloc (#722) : ce que le web et le
// mobile assemblent tous deux avant d'écrire une ligne. Un exercice de bloc ne porte que sa grille
// et sa note ; son contenu — titre, consigne, documents, tags — vit dans `exercises`, sous le même
// identifiant.

export type ReadExercise = {
  row: ScheduledSessionBlockDto["exercises"][number];
  content: ScheduledSessionExerciseDto;
  /** « 1.2 », ou `null` dans un bloc à libellé. */
  code: string | null;
};

export type ReadBlock = {
  block: ScheduledSessionBlockDto;
  /** Le numéro du bloc, ou `null` pour un bloc à libellé, qui affiche son libellé. */
  number: string | null;
  exercises: ReadExercise[];
  /** Le titre de chaque exercice, dans l'ordre : la phrase et le compteur les citent. */
  names: string[];
  /** Le code de chaque exercice, son titre à défaut : la ligne d'un tour les enchaîne. */
  labels: string[];
};

/**
 * Les blocs de la séance, prêts à lire. Un exercice de bloc sans contenu dans `exercises` serait un
 * bug de l'API — les deux listes viennent des mêmes lignes —, pas un cas à absorber.
 */
export function readScheduledBlocks(session: ScheduledSessionDto): ReadBlock[] {
  const contentById = new Map(session.exercises.map((exercise) => [exercise.id, exercise]));
  const numbers = blockNumbers(session.blocks);
  return session.blocks.map((block, index) => {
    const number = numbers[index] ?? null;
    const codes = exerciseCodes(number, block.exercises.length);
    const exercises = block.exercises.map((row, position) => ({
      row,
      // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
      content: required(contentById.get(row.id), "exercice de bloc sans contenu"),
      code: codes[position] ?? null,
    }));
    const names = exercises.map((exercise) => exercise.content.title);
    return {
      block,
      number,
      exercises,
      names,
      labels: exerciseLabels(number, names),
    };
  });
}

/** Le nom d'un bloc dans un titre : son numéro, son libellé à défaut. */
export function blockHeading(read: Pick<ReadBlock, "block" | "number">): string {
  return read.number ?? read.block.label ?? "";
}

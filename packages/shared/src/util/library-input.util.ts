import type { Adjustments } from "../dto/dosage-override.schema";
import type { CreateExerciseInput } from "../dto/exercise.schema";
import type { ExerciseBlocks } from "../dto/exercise-block.schema";
import type { RichDocument } from "../dto/rich-document.schema";
import type { CreateSessionInput } from "../dto/session.schema";

/**
 * Ce que le constructeur d'exercice ENVERRAIT — depuis sa saisie, ou depuis l'exercice enregistré.
 *
 * Une seule écriture pour les deux côtés : c'est ce qui permet de dire qu'un écran montre autre
 * chose que l'enregistré (#327). Le brouillon et l'exercice ne se comparent pas directement — un
 * titre suivi d'une espace, une consigne vide, ne changent rien à ce qui part.
 */
export type ExerciseFields = {
  title: string;
  tags: string[];
  instructions: RichDocument | null;
  blocks: ExerciseBlocks;
};

export function toExerciseInput(fields: ExerciseFields): CreateExerciseInput {
  return {
    title: fields.title.trim(),
    tags: fields.tags,
    // Document vide → `null` et non `[]` : « pas de consigne » est une absence, pas un document
    // sans bloc (règle nullable n°5).
    instructions:
      fields.instructions == null || fields.instructions.length === 0 ? null : fields.instructions,
    blocks: fields.blocks,
  };
}

/** Une ligne de composition, telle que saisie (`note` en chaîne) ou relue (`note` nullable). */
export type SessionLineFields = {
  /** Absent = ligne ajoutée, jamais enregistrée. */
  id?: string | undefined;
  exerciseId: string;
  note: string | null;
  blocks: ExerciseBlocks;
  adjustments: Adjustments;
};

export type SessionFields = {
  title: string;
  notes: string | null;
  exercises: readonly SessionLineFields[];
};

/** Ce que le constructeur de séance ENVERRAIT — même rôle que `toExerciseInput`. */
export function toSessionInput(fields: SessionFields): CreateSessionInput {
  return {
    title: fields.title.trim(),
    notes: blankToNull(fields.notes),
    exercises: fields.exercises.map((line) => ({
      ...(line.id == null ? {} : { id: line.id }),
      exerciseId: line.exerciseId,
      note: blankToNull(line.note),
      blocks: line.blocks,
      adjustments: line.adjustments,
    })),
  };
}

// Un texte blanc n'est pas une note : il part en `null`, comme une note jamais écrite.
function blankToNull(text: string | null): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

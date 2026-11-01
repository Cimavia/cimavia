import type { CreateExerciseInput } from "../dto/exercise.schema";
import type { RichDocument } from "../dto/rich-document.schema";
import type { SuggestedMetric } from "../dto/suggested-metric.schema";

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
  /** Plus de blocs (#718) : l'exercice ne se dose plus, la séance le fait. */
  suggestedMetrics: SuggestedMetric[];
};

export function toExerciseInput(fields: ExerciseFields): CreateExerciseInput {
  return {
    title: fields.title.trim(),
    tags: fields.tags,
    // Document vide → `null` et non `[]` : « pas de consigne » est une absence, pas un document
    // sans bloc (règle nullable n°5).
    instructions:
      fields.instructions == null || fields.instructions.length === 0 ? null : fields.instructions,
    suggestedMetrics: fields.suggestedMetrics,
  };
}

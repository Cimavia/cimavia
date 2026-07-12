import { DOCUMENT_MIME_TYPES, ExerciseCategory } from "@cmv/shared";

// Ordre d'affichage des catégories (filtres + formulaire). Les libellés passent par i18n.
export const EXERCISE_CATEGORIES = [
  ExerciseCategory.RENFO,
  ExerciseCategory.GRIMPE,
  ExerciseCategory.TECHNIQUE,
] as const;

// Attribut `accept` de l'input file — dérivé de la source unique @cmv/shared (pas de duplication).
export const ACCEPTED_DOCUMENT_ATTR = DOCUMENT_MIME_TYPES.join(",");

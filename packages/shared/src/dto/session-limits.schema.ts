// Les bornes d'une séance, à part du schéma de séance : le bloc de séance (#715) les lit, et la
// séance lit ses blocs (#716). Réunies dans `session.schema`, les deux modules s'importaient l'un
// l'autre.

/**
 * La NOTE d'un exercice dans une séance : le contexte que la grille ne dit pas. Anciennement
 * « prescription », qui portait le dosage écrit à la main — ce rôle revient à `blocks` (#164).
 */
export const SESSION_NOTE_MAX_LENGTH = 2000;
/**
 * Garde-fou, pas règle métier (#297) : un Coach compose quelques dizaines d'exercices au plus.
 * Sans lui, un `exerciseId` répété des milliers de fois tenait sous la limite de corps et faisait
 * recopier autant de fois les blocs de l'exercice. Il borne aussi les séances planifiées, et
 * donc le suivi qu'un débrief peut remonter.
 */
export const SESSION_MAX_EXERCISES = 50;
export const SESSION_TOO_MANY_EXERCISES_MESSAGE = `Une séance ne peut pas dépasser ${SESSION_MAX_EXERCISES} exercices.`;

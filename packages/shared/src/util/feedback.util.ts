/**
 * Ce dont dépend « ce débrief est-il à relire ? », et rien de plus — même forme structurelle
 * qu'`InvoiceTiming` et `ReminderTiming` : la fonction accepte donc aussi bien un
 * `CoachFeedbackSummaryDto` complet qu'une ligne réduite.
 */
export type FeedbackReadState = { coachReadAt: string | null };

/**
 * Les débriefs que le coach n'a pas encore ouverts — et ceux que l'athlète a COMPLÉTÉS depuis :
 * l'API repasse alors `coachReadAt` à `null`, ce qui les remet dans la pile. « Non lu » veut donc
 * dire « quelque chose reste à lire », pas « jamais ouvert ».
 *
 * `null` en entrée → `null` en sortie : tant que la liste n'est pas là (chargement, panne), le
 * rendu affiche « — » et non un `0` qui laisserait croire qu'il n'y a rien à relire (règle
 * nullable).
 */
export function countUnreadFeedbacks(
  feedbacks: readonly FeedbackReadState[] | null | undefined,
): number | null {
  if (feedbacks == null) return null;
  return feedbacks.filter((feedback) => feedback.coachReadAt == null).length;
}

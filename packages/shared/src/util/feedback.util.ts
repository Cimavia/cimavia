import { type MediaType, maxFeedbackMediaCount } from "../dto/feedback.schema";

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

/**
 * Ce dont dépend « reste-t-il de la place pour ce type de média ? » : la liste des médias déjà
 * attachés, et rien d'autre.
 */
export type FeedbackMediaSlots = { media: readonly { type: MediaType }[] };

/**
 * Combien de médias de ce type l'athlète peut encore joindre.
 *
 * Le quota ne peut PAS vivre dans le schéma Zod : il dépend de l'état en base, que seul le service
 * connaît (il compte, puis rejette en 409). Cette dérivation est ce qui permet au client d'éteindre
 * le bouton d'ajout **avant** d'envoyer un fichier pour rien — et `maxFeedbackMediaCount` reste la
 * source unique de la valeur, des deux côtés.
 *
 * `feedback` à `null` = aucun débrief encore créé : tous les emplacements sont libres. C'est un
 * état légitime, pas une absence de donnée — un débrief média-seul commence forcément là.
 */
export function remainingMediaSlots(
  feedback: FeedbackMediaSlots | null | undefined,
  type: MediaType,
): number {
  const used = feedback?.media.filter((item) => item.type === type).length ?? 0;
  return maxFeedbackMediaCount(type) - used;
}

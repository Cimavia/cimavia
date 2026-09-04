/**
 * Le destinataire d'un cycle diffusé, ou de ce qui en dépend (semaine, séance, facture).
 *
 * Depuis #144, `athleteId` est nullable : un cycle se construit avant qu'on sache pour qui. Mais
 * `publish` refuse un cycle sans destinataire — sur tout ce qui est DIFFUSÉ, la colonne est donc
 * pleine, et le type est seul à l'ignorer.
 *
 * Le narrowing passe par ici plutôt que par un `!` sur chaque appel : un `!` dit « fais-moi
 * confiance » et, le jour où l'invariant tombe, notifie `undefined` en silence — exactement le
 * genre de panne muette que #172 décrit. Celui-ci NOMME ce qui le garantit et casse bruyamment.
 *
 * Une erreur et non une exception HTTP : ce n'est pas une saisie invalide qu'un utilisateur
 * pourrait corriger, c'est un état que le code prétend impossible. Même parti pris que
 * `toPlanWeekDto` devant une semaine au numéro corrompu.
 */
export function athleteRecipientOrThrow(row: { id: string; athleteId: string | null }): string {
  if (row.athleteId == null) {
    throw new Error(
      `[plan] ${row.id} : destinataire absent sur un cycle diffusé — l'invariant de publish est rompu`,
    );
  }
  return row.athleteId;
}

import type { InvoiceService } from "../invoice/service/invoice.service";
import type { TenantTx } from "../tenancy/tenancy.extension";

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

/**
 * Le destinataire descend sur TOUTE la chaîne de planification, dans la transaction de
 * l'affectation. Un cycle à moitié affecté est un cycle dont la moitié des séances reste
 * invisible de son athlète — une panne silencieuse, et la pire qui soit ici.
 *
 * SEPT tables, parce que l'extension tenant filtre par un champ du modèle INTERROGÉ et ne sait
 * pas remonter la relation. Les quatre dernières ne portent pas `planId` : on descend donc par
 * identifiants collectés plutôt que par filtre relationnel imbriqué, dont le SQL n'est
 * vérifiable qu'à l'exécution — sur un invariant de tenant, on préfère le chemin qui se lit.
 *
 * La facture brouillon suit dans le même mouvement (`followPlanAthlete`), sans quoi elle serait
 * émise au nom du destinataire précédent.
 */
export async function propagateAthlete(
  tx: TenantTx,
  invoices: Pick<InvoiceService, "followPlanAthlete">,
  planId: string,
  athleteId: string | null,
): Promise<void> {
  // `@updatedAt` fait avancer chaque semaine, et c'est voulu (#604) : un collage ou un glisser
  // pensé pour l'athlète d'avant n'a pas à passer en silence chez le suivant.
  await tx.planWeek.updateMany({ where: { planId }, data: { athleteId } });
  await tx.scheduledSession.updateMany({ where: { planId }, data: { athleteId } });
  if (athleteId != null) {
    await invoices.followPlanAthlete(tx, planId, athleteId);
  }

  const sessions = await tx.scheduledSession.findMany({
    where: { planId },
    select: { id: true },
  });
  if (sessions.length === 0) return;

  const inSessions = { scheduledSessionId: { in: sessions.map((session) => session.id) } };
  await tx.scheduledSessionExercise.updateMany({ where: inSessions, data: { athleteId } });
  // Les blocs aussi (#716) : sinon l'athlète ne lit ni ne suit ceux de sa séance.
  await tx.scheduledSessionBlock.updateMany({ where: inSessions, data: { athleteId } });

  const exercises = await tx.scheduledSessionExercise.findMany({
    where: inSessions,
    select: { id: true },
  });
  if (exercises.length === 0) return;

  const inExercises = {
    scheduledSessionExerciseId: { in: exercises.map((exercise) => exercise.id) },
  };
  await tx.scheduledSessionExerciseDocument.updateMany({
    where: inExercises,
    data: { athleteId },
  });
  await tx.scheduledSessionExerciseTag.updateMany({ where: inExercises, data: { athleteId } });
}

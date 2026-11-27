import { required } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toScheduledSessionBlockDto } from "../session/session-block.mapper";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { shiftDbDate } from "../util/date.util";
import { parseCustomMetrics, parseInstructions } from "../util/exercise-json.util";
import type { ScheduledSessionWithExercises } from "./scheduled-session.mapper";
import { copiedBlocksOf, insertScheduledSessionExercises } from "./scheduled-session.writer";

/** La semaine qui reçoit les copies, et l'athlète de SON cycle — `null` compris (#144). */
export type SessionCopyTarget = {
  planId: string;
  planWeekId: string;
  athleteId: string | null;
};

/**
 * Recopie des séances planifiées dans une semaine : la copie d'une semaine (#4) et celle d'un cycle
 * entier (#5), qui l'appelle une fois par semaine.
 *
 * Ce que la copie emporte : ce que le COACH a composé — séance, consignes, blocs, exercices,
 * documents, tags. Ce qu'elle laisse : tout ce qui appartient à l'athlète ou à l'exécution — le
 * `status` (une copie est `PLANNED`, jamais `DONE`), les débriefs et leurs médias, les messages
 * rattachés. N'écrit rien d'autre : la semaine cible est vide quand on l'appelle.
 *
 * Les dates se décalent de `shiftDays`, un multiple de 7 (deux lundis) : le jour de semaine tient,
 * et les triplets (semaine, date, position) restent uniques après translation.
 */
export async function copyScheduledSessions(
  tx: TenantTx,
  sessions: readonly ScheduledSessionWithExercises[],
  target: SessionCopyTarget,
  shiftDays: number,
): Promise<void> {
  for (const session of sessions) {
    const created = await tx.scheduledSession.create({
      // coachId injecté par le tenancy layer ; athleteId dénormalisé explicitement — celui du
      // plan CIBLE, jamais celui de la source : une copie inter-planification change d'athlète.
      // `status` est laissé à son défaut (PLANNED) : il décrit l'exécution, pas la composition.
      data: {
        athleteId: target.athleteId,
        planId: target.planId,
        planWeekId: target.planWeekId,
        sourceSessionId: session.sourceSessionId,
        title: session.title,
        notes: session.notes,
        scheduledDate: shiftDbDate(session.scheduledDate, shiftDays),
        position: session.position,
      } satisfies Omit<
        Prisma.ScheduledSessionUncheckedCreateInput,
        "coachId"
      > as Prisma.ScheduledSessionUncheckedCreateInput,
    });

    // Les blocs (#716) aussi, avec la référence que la source a reçue.
    const { blocks, placements } = copiedBlocksOf(session.blocks.map(toScheduledSessionBlockDto));
    // Les documents viennent de l'INSTANCE source, pas de la bibliothèque : `sourceExerciseId`
    // peut être null (exercice supprimé de la bibliothèque, SetNull) alors que l'instance porte
    // toujours ses copies. Y repasser les perdrait — c'est le sens de « copie autonome ».
    await insertScheduledSessionExercises(
      tx,
      created.id,
      // L'athlète du plan CIBLE, `null` compris : coller dans un brouillon non affecté
      // (#144) ne doit pas y faire entrer le destinataire de la source.
      target.athleteId,
      // Les tags de l'instance source sont aplatis en noms : le draft attend la forme du DTO,
      // pas les lignes de la table de copie.
      // Consigne et métriques repassent par Zod : elles sortent de Prisma en `JsonValue`, que
      // le draft n'accepte pas — et le faire ICI garde la copie fidèle à l'instance source.
      session.exercises.map((exercise) => ({
        exercise: {
          sourceExerciseId: exercise.sourceExerciseId,
          title: exercise.title,
          description: exercise.description,
          instructions: parseInstructions(exercise.instructions),
          customMetrics: parseCustomMetrics(exercise.customMetrics),
          tags: exercise.tags.map((tag) => tag.name),
          note: exercise.note,
        },
        documents: exercise.documents,
        // La copie garde la place et la grille de la source, origine comprise.
        placement: required(
          placements.get(exercise.id),
          `[plan] l'exercice ${exercise.id} hors de ses blocs`,
        ),
      })),
      blocks,
    );
  }
}

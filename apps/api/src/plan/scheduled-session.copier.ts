import { required } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toScheduledSessionBlockDto } from "../session/session-block.mapper";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { shiftDbDate } from "../util/date.util";
import { parseCustomMetrics, parseInstructions } from "../util/exercise-json.util";
import type { ScheduledSessionWithExercises } from "./scheduled-session.mapper";
import { copiedBlocksOf, insertCompositions, newRowId } from "./scheduled-session.writer";

/** La semaine qui reçoit des copies, et l'athlète de SON cycle — `null` compris (#144). */
export type SessionCopyTarget = {
  planId: string;
  planWeekId: string;
  athleteId: string | null;
};

/** Des séances à recopier, et la semaine qui les reçoit. */
export type SessionCopy = {
  sessions: readonly ScheduledSessionWithExercises[];
  target: SessionCopyTarget;
};

/**
 * Recopie des séances planifiées dans leurs semaines cibles : la copie d'une semaine (#4) en passe
 * une, celle d'un cycle entier (#5) une par semaine — en UN lot, une requête par table.
 *
 * Ce que la copie emporte : ce que le COACH a composé — séance, consignes, blocs, exercices,
 * documents, tags. Ce qu'elle laisse : tout ce qui appartient à l'athlète ou à l'exécution — le
 * `status` (une copie est `PLANNED`, jamais `DONE`), les débriefs et leurs médias, les messages
 * rattachés. N'écrit rien d'autre : les semaines cibles sont vides quand on l'appelle.
 *
 * Les dates se décalent de `shiftDays`, un multiple de 7 (deux lundis) : le jour de semaine tient,
 * et les triplets (semaine, date, position) restent uniques après translation.
 */
export async function copyScheduledSessions(
  tx: TenantTx,
  copies: readonly SessionCopy[],
  shiftDays: number,
): Promise<void> {
  const planned = copies.flatMap(({ sessions, target }) =>
    sessions.map((session) => ({ session, target, id: newRowId() })),
  );
  if (planned.length === 0) return;

  await tx.scheduledSession.createMany({
    // coachId injecté par le tenancy layer ; athleteId dénormalisé explicitement — celui du
    // plan CIBLE, jamais celui de la source : une copie inter-planification change d'athlète.
    // `status` est laissé à son défaut (PLANNED) : il décrit l'exécution, pas la composition.
    data: planned.map(
      ({ session, target, id }) =>
        ({
          id,
          athleteId: target.athleteId,
          planId: target.planId,
          planWeekId: target.planWeekId,
          sourceSessionId: session.sourceSessionId,
          title: session.title,
          notes: session.notes,
          scheduledDate: shiftDbDate(session.scheduledDate, shiftDays),
          position: session.position,
        }) satisfies Omit<
          Prisma.ScheduledSessionUncheckedCreateInput,
          "coachId"
        > as Prisma.ScheduledSessionUncheckedCreateInput,
    ),
  });

  await insertCompositions(
    tx,
    planned.map(({ session, target, id }) => {
      // Les blocs (#716) aussi, avec la référence que la source a reçue.
      const { blocks, placements } = copiedBlocksOf(session.blocks.map(toScheduledSessionBlockDto));
      return {
        scheduledSessionId: id,
        // L'athlète du plan CIBLE, `null` compris : coller dans un brouillon non affecté
        // (#144) ne doit pas y faire entrer le destinataire de la source.
        athleteId: target.athleteId,
        blocks,
        // Les documents viennent de l'INSTANCE source, pas de la bibliothèque : `sourceExerciseId`
        // peut être null (exercice supprimé de la bibliothèque, SetNull) alors que l'instance
        // porte toujours ses copies. Y repasser les perdrait — c'est le sens de « copie
        // autonome ». Les tags de l'instance sont aplatis en noms, et consigne et métriques
        // repassent par Zod : elles sortent de Prisma en `JsonValue`, que le draft n'accepte pas.
        drafts: session.exercises.map((exercise) => ({
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
      };
    }),
  );
}

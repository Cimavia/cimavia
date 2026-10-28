import {
  appliedEdit,
  type CompositionEdit,
  type CompositionLibrary,
  type CompositionOutcome,
  CompositionOutcomeKind,
  CompositionRefusal,
  isDebriefed,
  type PlannedCompositionBlock,
  PlanStatus,
  required,
  resetComposition,
  revertedEdit,
  type ScheduledCompositionInput,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  type VersionQuery,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { type CatalogOf, gridCatalogOf } from "../../custom-metric/custom-metric.mapper";
import { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import type { LibraryExercise } from "../../exercise/exercise.mapper";
import { ExerciseService } from "../../exercise/service/exercise.service";
import { NotificationService } from "../../notification/notification.service";
import {
  SCHEDULED_SESSION_BLOCKS_INCLUDE,
  toScheduledSessionBlockDto,
} from "../../session/session-block.mapper";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";
import {
  parseCustomMetrics,
  parseInstructions,
  parseSuggestedMetrics,
} from "../../util/exercise-json.util";
import { assertReadAtVersion, writeAtVersion } from "../../util/stale-write.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import { touchWeeks } from "../plan-week.version";
import { assertComposable, definitionsOf } from "../scheduled-composition.rules";
import { type ComposedRow, rewriteScheduledComposition } from "../scheduled-session.writer";
import { PlanService } from "./plan.service";
import { ScheduledSessionService } from "./scheduled-session.service";

const SESSION_NOT_FOUND = "Séance planifiée introuvable";

/** Une copie avec ce que sa composition récrit : ses blocs, et ses lignes pour leurs définitions. */
const COPY_INCLUDE = {
  blocks: SCHEDULED_SESSION_BLOCKS_INCLUDE,
  exercises: { select: { id: true, key: true, customMetrics: true } },
} satisfies Prisma.ScheduledSessionInclude;

type CopyRow = Prisma.ScheduledSessionGetPayload<{ include: typeof COPY_INCLUDE }>;

/** Une copie lue, ses blocs convertis UNE fois : chaque étape du geste les relit. */
type Copy = { row: CopyRow; blocks: ScheduledSessionBlockDto[] };

/** La séance d'où le panneau compose : elle désigne le Plan et la séance-type des copies. */
type Anchor = { id: string; planId: string; sourceSessionId: string | null };

/** Une copie à récrire, et la version sous laquelle le Coach l'a lue. */
type CopyWrite = {
  copy: Copy;
  expected: Date;
  blocks: PlannedCompositionBlock<ComposedRow>[];
};

function toCopyDto({ row, blocks }: Copy): ScheduledSessionCopyDto {
  return {
    id: row.id,
    planWeekId: row.planWeekId,
    scheduledDate: toIsoDate(row.scheduledDate),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    blocks,
  };
}

/**
 * La composition d'une séance planifiée pour les semaines choisies (#720). Le panneau ne règle
 * plus les valeurs : il ajoute, remplace ou retire un exercice, et le changement s'écrit sur
 * chaque copie de la même séance-type dans le Plan, en une transaction. Aucun lien n'est stocké
 * entre les copies : un ajout ou un remplaçant porte la même clé dans chacune.
 *
 * Les gestes sont ceux de `@cmv/shared` (`appliedEdit`, `revertedEdit`, `resetComposition`) : le
 * panneau les joue pour griser une semaine, le serveur pour écrire. Le verrou du niveau planifié
 * se revérifie ici contre la `baseline` STOCKÉE (`plannedLockIssues`).
 */
@Injectable()
export class ScheduledCompositionService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly plans: PlanService,
    private readonly sessions: ScheduledSessionService,
    private readonly library: ExerciseService,
    private readonly metrics: CustomMetricService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Les copies de la séance-type dans le Plan de la séance, elle comprise, dans l'ordre du
   * calendrier. Une séance dont la séance-type a été supprimée (`SetNull`) n'a qu'elle-même.
   */
  async copies(id: string): Promise<ScheduledSessionCopyDto[]> {
    const anchor = await this.sessions.getReadableOrThrow(id);
    return (await this.readCopies(anchor)).map(toCopyDto);
  }

  async compose(id: string, input: ScheduledCompositionInput): Promise<ScheduledSessionCopyDto[]> {
    const anchor = await this.sessions.getReadableOrThrow(id);
    const { plan } = await this.plans.getForOrThrow(anchor.planId, "write");
    const targets = [
      ...input.apply.map((version) => ({ ...version, revert: false })),
      ...input.revert.map((version) => ({ ...version, revert: true })),
    ];
    const copies = await this.readCopies(
      anchor,
      targets.map((target) => target.id),
    );
    const library = await this.libraryFor(anchor, copies, input.edit);

    const writes = targets.flatMap((target): CopyWrite[] => {
      const copy = copies.find((each) => each.row.id === target.id);
      if (copy === undefined) {
        throw new BadRequestException(
          `La séance ${target.id} n'est pas une copie de cette séance-type`,
        );
      }
      const expected = new Date(target.expectedUpdatedAt);
      // Avant de juger le changement contre une composition que la saisie n'a pas vue.
      assertReadAtVersion(copy.row.updatedAt, expected);
      const outcome = target.revert
        ? revertedEdit(copy.blocks, input.edit, library.place)
        : appliedEdit(copy.blocks, input.edit, library.place);
      return written(copy, expected, outcome);
    });

    await this.write(anchor, plan, writes, library);
    return (await this.readCopies(anchor)).map(toCopyDto);
  }

  /** « Tout réinitialiser » : la composition de la séance-type reçue, pour la semaine du panneau. */
  async reset(id: string, query: VersionQuery): Promise<ScheduledSessionCopyDto[]> {
    const anchor = await this.sessions.getReadableOrThrow(id);
    const { plan } = await this.plans.getForOrThrow(anchor.planId, "write");
    const [copy] = await this.readCopies(anchor, [anchor.id]);
    // La séance vient d'être lue, dans le même scope.
    if (copy === undefined) throw new BadRequestException(SESSION_NOT_FOUND);
    const expected = new Date(query.expectedUpdatedAt);
    assertReadAtVersion(copy.row.updatedAt, expected);
    const library = await this.libraryFor(anchor, [copy], null);

    await this.write(
      anchor,
      plan,
      written(copy, expected, resetComposition(copy.blocks, library.place)),
      library,
    );
    return (await this.readCopies(anchor)).map(toCopyDto);
  }

  /**
   * Les copies, scopées par la couche d'isolation : une séance d'un autre Plan ou d'une autre
   * séance-type n'y figure pas, et `compose` la refuse.
   */
  private async readCopies(anchor: Anchor, ids?: readonly string[]): Promise<Copy[]> {
    const copiesOf: Prisma.ScheduledSessionWhereInput =
      anchor.sourceSessionId === null
        ? { id: anchor.id }
        : { planId: anchor.planId, sourceSessionId: anchor.sourceSessionId };
    const rows = await this.db.scheduledSession.findMany({
      where: ids === undefined ? copiesOf : { AND: [copiesOf, { id: { in: [...ids] } }] },
      include: COPY_INCLUDE,
      orderBy: [{ scheduledDate: "asc" }, { position: "asc" }],
    });
    return rows.map((row) => ({ row, blocks: row.blocks.map(toScheduledSessionBlockDto) }));
  }

  /**
   * Les exercices que le changement peut placer : le nouveau, et ceux que la séance-type a donnés,
   * à rendre. Lus sans refus (`loadAccessible`) : un exercice parti de la bibliothèque ne se rend
   * plus, et le geste le dit (`NOT_IN_LIBRARY`) au lieu d'un refus global.
   *
   * Seuls ceux à RENDRE passent par la citation de la séance-type, qui ouvre un exercice privé de
   * son propriétaire (#605). Le nouveau se lit comme dans l'éditeur à plat, sans elle : sans quoi
   * un exercice privé qu'elle cite se placerait n'importe où, sur son seul identifiant.
   */
  private async libraryFor(anchor: Anchor, copies: readonly Copy[], edit: CompositionEdit | null) {
    const placed = edit !== null && "exerciseId" in edit ? edit.exerciseId : null;
    const restored = copies.flatMap((copy) =>
      copy.blocks.flatMap((block) =>
        block.baseline.exercises.flatMap((exercise) =>
          exercise.exerciseId === null ? [] : [exercise.exerciseId],
        ),
      ),
    );
    const [fresh, cited] = await Promise.all([
      this.library.loadAccessible(placed === null ? [] : [placed], null),
      this.library.loadAccessible(restored, anchor.sourceSessionId),
    ]);
    // Le nouvel exercice ne se lit que sans la citation, même si la séance-type le cite aussi.
    const loaded = new Map([...[...cited].filter(([id]) => id !== placed), ...fresh]);
    const catalogOf = await this.metrics.catalogOf([
      ...[...loaded.values()].map((exercise) => exercise.coachId),
      ...copies.map((copy) => copy.row.coachId),
    ]);
    const place: CompositionLibrary = (exerciseId) => {
      const exercise = loaded.get(exerciseId);
      if (exercise === undefined) return null;
      return {
        id: exercise.id,
        suggestedMetrics: parseSuggestedMetrics(exercise.suggestedMetrics),
        customMetrics: catalogOf(exercise.coachId),
      };
    };
    return { place, loaded, catalogOf };
  }

  private async write(
    anchor: Anchor,
    plan: { id: string; status: string; athleteId: string | null },
    writes: readonly CopyWrite[],
    library: { loaded: ReadonlyMap<string, LibraryExercise>; catalogOf: CatalogOf },
  ): Promise<void> {
    if (writes.length === 0) return;
    const sessionTypeKeys = await this.sessionTypeKeys(anchor);
    for (const { copy, blocks } of writes) assertComposable(copy.blocks, blocks, sessionTypeKeys);

    await this.db.$transaction(async (tx) => {
      // Les semaines d'abord (`touchWeeks`) : la grille montre le compte des exercices, et l'ordre
      // des verrous reste celui des autres gestes sur une séance.
      await touchWeeks(tx, { id: { in: writes.map(({ copy }) => copy.row.planWeekId) } });
      for (const { copy: written, expected, blocks } of writes) {
        const copy = written.row;
        // La version d'abord : elle verrouille la ligne, et rien de ce qui suit ne s'écrit sur une
        // séance qu'un autre Coach a changée depuis la lecture.
        await writeAtVersion(tx.scheduledSession, copy.id, expected, {}, SESSION_NOT_FOUND);
        const stored = copy.exercises.flatMap((row) =>
          row.key === null ? [] : [{ id: row.id, key: row.key }],
        );
        const frozen = copy.exercises.flatMap((row) => parseCustomMetrics(row.customMetrics));
        await rewriteScheduledComposition(
          tx,
          {
            id: copy.id,
            athleteId: copy.athleteId,
            parking: copy.exercises.length + blocks.flatMap((block) => block.exercises).length,
          },
          copy.blocks.map((block) => block.id),
          stored,
          blocks,
          (row) => {
            const exercise = library.loaded.get(row.exerciseId);
            // `place` ne rend que ce que `loaded` porte : le geste ne place rien d'autre.
            if (exercise === undefined) throw new BadRequestException("Exercice introuvable");
            return {
              exercise: {
                sourceExerciseId: exercise.id,
                title: exercise.title,
                description: exercise.description,
                instructions: parseInstructions(exercise.instructions),
                blocks: [],
                adjustments: [],
                customMetrics: definitionsOf(
                  row,
                  frozen,
                  gridCatalogOf(library.catalogOf, exercise.coachId, copy.coachId),
                ),
                tags: exercise.tags.map((tag) => tag.name).sort(),
                note: row.note,
              },
              baseline: [],
              baselineAdjustments: [],
              documents: exercise.documents,
            };
          },
        );
      }
    });

    // Un changement, une annonce — quel que soit le nombre de semaines qu'il touche (N-6).
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanUpdated({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: required(writes[0], "[plan] composition sans copie").copy.row.title,
      });
    }
  }

  /**
   * Les clés de la séance-type COURANTE : un exercice nouveau n'en prend aucune, pas plus qu'une
   * clé de la référence (#716). Celle d'un autre Coach, qu'on ne lit pas, n'en donne aucune.
   */
  private async sessionTypeKeys(anchor: Anchor): Promise<string[]> {
    if (anchor.sourceSessionId === null) return [];
    const rows = await this.db.sessionExercise.findMany({
      where: { sessionId: anchor.sourceSessionId, key: { not: null } },
      select: { key: true },
    });
    return rows.flatMap((row) => (row.key === null ? [] : [row.key]));
  }
}

/**
 * Ce qu'une copie écrit : rien quand le changement y est déjà, 400 quand elle le refuse — ou
 * qu'elle est débriefée, quel que soit le changement (`DEBRIEFED`).
 */
function written(
  copy: Copy,
  expected: Date,
  outcome: CompositionOutcome<ScheduledSessionBlockDto["exercises"][number]>,
): CopyWrite[] {
  const refusal = refusalOf(copy, outcome);
  if (refusal !== null) {
    throw new BadRequestException(
      `La séance du ${toIsoDate(copy.row.scheduledDate)} refuse ce changement (${refusal})`,
    );
  }
  return outcome.kind === CompositionOutcomeKind.CHANGED
    ? [{ copy, expected, blocks: outcome.blocks }]
    : [];
}

function refusalOf(
  copy: Copy,
  outcome: CompositionOutcome<ScheduledSessionBlockDto["exercises"][number]>,
): CompositionRefusal | null {
  if (isDebriefed(copy.row)) return CompositionRefusal.DEBRIEFED;
  return outcome.kind === CompositionOutcomeKind.REFUSED ? outcome.refusal : null;
}

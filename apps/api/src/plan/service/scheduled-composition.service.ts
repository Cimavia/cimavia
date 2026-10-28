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
  type ScheduledDosageInput,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  sameJson,
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
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toJsonInput } from "../../util/block-json.util";
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
import { dosedBlocks } from "../scheduled-dosage.rules";
import { type ComposedRow, rewriteScheduledComposition } from "../scheduled-session.writer";
import { PlanService } from "./plan.service";
import { ScheduledSessionService } from "./scheduled-session.service";

const SESSION_NOT_FOUND = "Séance planifiée introuvable";

/**
 * Une copie avec ce que sa composition récrit : ses blocs, et ses lignes pour leurs définitions —
 * que Dosage lit aussi, avec leur titre.
 */
const COPY_INCLUDE = {
  blocks: SCHEDULED_SESSION_BLOCKS_INCLUDE,
  exercises: { select: { id: true, key: true, title: true, customMetrics: true } },
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
  const inBlocks = new Set(blocks.flatMap((block) => block.exercises.map(({ id }) => id)));
  return {
    id: row.id,
    planWeekId: row.planWeekId,
    scheduledDate: toIsoDate(row.scheduledDate),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    blocks,
    exercises: row.exercises
      .filter((exercise) => inBlocks.has(exercise.id))
      .map((exercise) => ({
        id: exercise.id,
        title: exercise.title,
        customMetrics: parseCustomMetrics(exercise.customMetrics),
      })),
  };
}

/**
 * La composition d'une séance planifiée pour les semaines choisies (#720), et ses valeurs semaine
 * par semaine (#721). Le panneau ajoute, remplace ou retire un exercice ; Dosage règle les valeurs.
 * L'un comme l'autre s'écrit sur les copies de la même séance-type dans le Plan, en une transaction. Aucun lien n'est stocké
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
      const copy = copyOf(copies, target.id);
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
   * « Enregistrer » de Dosage (#721) : les valeurs des copies changées, chacune sous sa version
   * lue. Une copie refusée — débriefée, d'une autre composition, aux valeurs invalides — arrête
   * tout : aucune semaine ne s'écrit à moitié.
   */
  async dose(id: string, input: ScheduledDosageInput): Promise<ScheduledSessionCopyDto[]> {
    const anchor = await this.sessions.getReadableOrThrow(id);
    const { plan } = await this.plans.getForOrThrow(anchor.planId, "write");
    const copies = await this.readCopies(
      anchor,
      input.sessions.map((session) => session.id),
    );

    const writes = input.sessions.flatMap((target) => {
      const copy = copyOf(copies, target.id);
      const expected = new Date(target.expectedUpdatedAt);
      assertReadAtVersion(copy.row.updatedAt, expected);
      if (isDebriefed(copy.row)) throw refused(copy, CompositionRefusal.DEBRIEFED);
      const frozen = new Map(
        copy.row.exercises.map((row) => [row.id, parseCustomMetrics(row.customMetrics)]),
      );
      // Chaque exercice d'un bloc est une ligne de la copie : `readCopies` les lit ensemble.
      const blocks = dosedBlocks(copy.blocks, target.blocks, (rowId) =>
        required(frozen.get(rowId), "[dosage] exercice sans ligne"),
      );
      // Rien n'a bougé : ni version, ni semaine, ni annonce — comme un geste sans effet (#720).
      return sameJson(copy.blocks, blocks) ? [] : [{ copy, expected, blocks }];
    });

    await this.commit(plan, writes, (tx, { copy, blocks }) => writeValues(tx, copy, blocks));
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

    await this.commit(plan, writes, async (tx, { copy: written, blocks }) => {
      const copy = written.row;
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
    });
  }

  /**
   * Écrit des copies, chacune sous sa version lue, puis l'annonce. Rien à écrire : rien ne part.
   *
   * Les semaines d'abord (`touchWeeks`) : la grille montre le compte des exercices, et l'ordre des
   * verrous reste celui des autres gestes sur une séance. Puis la version de chaque copie : elle
   * verrouille la ligne, et rien de ce qui suit ne s'écrit sur une séance qu'un autre Coach a
   * changée depuis la lecture.
   */
  private async commit<W extends { copy: Copy; expected: Date }>(
    plan: { id: string; status: string; athleteId: string | null },
    writes: readonly W[],
    each: (tx: TenantTx, write: W) => Promise<void>,
  ): Promise<void> {
    const [first] = writes;
    if (first === undefined) return;
    await this.db.$transaction(async (tx) => {
      await touchWeeks(tx, { id: { in: writes.map(({ copy }) => copy.row.planWeekId) } });
      for (const write of writes) {
        await writeAtVersion(
          tx.scheduledSession,
          write.copy.row.id,
          write.expected,
          {},
          SESSION_NOT_FOUND,
        );
        await each(tx, write);
      }
    });

    // Un enregistrement, une annonce — quel que soit le nombre de semaines qu'il touche (N-6).
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanUpdated({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: first.copy.row.title,
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

/** Une séance citée doit être une copie lue : d'un autre Plan ou d'une autre séance-type, non. */
function copyOf(copies: readonly Copy[], id: string): Copy {
  const copy = copies.find((each) => each.row.id === id);
  if (copy === undefined) {
    throw new BadRequestException(`La séance ${id} n'est pas une copie de cette séance-type`);
  }
  return copy;
}

function refused(copy: Copy, refusal: CompositionRefusal): BadRequestException {
  return new BadRequestException(
    `La séance du ${toIsoDate(copy.row.scheduledDate)} refuse ce changement (${refusal})`,
  );
}

/** Les valeurs d'une copie : seul ce qui a bougé s'écrit, un bloc retouché ailleurs garde ses réglages. */
async function writeValues(
  tx: TenantTx,
  copy: Copy,
  blocks: readonly ScheduledSessionBlockDto[],
): Promise<void> {
  const scheduledSessionId = copy.row.id;
  for (const [blockIndex, block] of blocks.entries()) {
    const before = required(copy.blocks[blockIndex], "[dosage] bloc stocké absent");
    if (!sameJson(before.settings, block.settings)) {
      await tx.scheduledSessionBlock.updateMany({
        where: { id: block.id, scheduledSessionId },
        data: { settings: toJsonInput(block.settings) },
      });
    }
    for (const [index, exercise] of block.exercises.entries()) {
      if (sameJson(before.exercises[index]?.grid, exercise.grid)) continue;
      await tx.scheduledSessionExercise.updateMany({
        where: { id: exercise.id, scheduledSessionId },
        data: { grid: toJsonInput(exercise.grid) },
      });
    }
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
  if (refusal !== null) throw refused(copy, refusal);
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

import type { BlockGrid, GridMetric, GridRow } from "../dto/block-grid.schema";
import { withMaterializedSeries } from "../dto/exercise-block.schema";
import type { MetricValue } from "../dto/exercise-metric.schema";
import { type PlanWeekDto, PlanWeekType } from "../dto/plan.schema";
import type { ScheduledSessionCopyDto } from "../dto/scheduled-composition.schema";
import type { DosageSessionInput } from "../dto/scheduled-dosage.schema";
import { CompositionOrigin, type ScheduledBlockExercise } from "../dto/session-block.schema";
import type { ScheduledSessionBlockDto } from "../dto/session-block-dto.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { required } from "./invariant.util";
import type { Phrase } from "./phrase.util";
import { gridValueAt, plannedChanges } from "./planned-blocks.util";
import { sameJson } from "./same-json.util";
import { isDebriefed } from "./scheduled-composition.util";
import { withSettingValue } from "./structure-draft.util";
import { gridRowLimit, roundsError, SettingValue, settingValues } from "./structure-settings.util";

// Dosage (#721) : toutes les valeurs d'une séance, semaine par semaine. Une colonne par copie de
// la séance-type dans le Plan, une ligne par valeur de bloc puis par métrique d'exercice. Chaque
// cellule se compare à la référence de SA copie — la séance-type telle qu'elle a été posée cette
// semaine-là (`baseline`) —, jamais à la séance-type d'aujourd'hui.

type DosageExercise = Pick<ScheduledBlockExercise, "key" | "origin"> & {
  id: string;
  grid: BlockGrid;
};
export type DosageBlock = Pick<ScheduledSessionBlockDto, "id" | "settings" | "baseline"> & {
  exercises: readonly DosageExercise[];
};
export type DosageCopy = Pick<
  ScheduledSessionCopyDto,
  "id" | "planWeekId" | "scheduledDate" | "status" | "updatedAt"
> & { blocks: readonly DosageBlock[] };

// ── Les séances-types du cycle ─────────────────────────────────────────────────────────────

/**
 * Une séance-type que Dosage règle : ses copies dans le cycle, lues depuis la première posée. Une
 * séance sans séance-type est sa propre copie.
 */
export type DosageSessionType = {
  key: string;
  /** La première copie, dans l'ordre du calendrier : c'est par elle que les autres se lisent. */
  anchorId: string;
  title: string;
  sourceSessionId: string | null;
};

/**
 * Les séances-types que Dosage règle dans ce cycle, dans l'ordre où elles arrivent. Seules celles
 * par blocs : une séance de l'ancien modèle se dose dans son panneau (BL-1).
 */
export function dosageSessionTypes(
  weeks: readonly Pick<PlanWeekDto, "weekNumber" | "sessions">[],
): DosageSessionType[] {
  const sessions = [...weeks]
    .sort((left, right) => left.weekNumber - right.weekNumber)
    .flatMap((week) =>
      [...week.sessions].sort(
        (left, right) =>
          left.scheduledDate.localeCompare(right.scheduledDate) || left.position - right.position,
      ),
    )
    .filter((session) => session.blockCount > 0);
  const types = new Map<string, DosageSessionType>();
  for (const session of sessions) {
    const key = session.sourceSessionId ?? session.id;
    if (types.has(key)) continue;
    types.set(key, {
      key,
      anchorId: session.id,
      title: session.title,
      sourceSessionId: session.sourceSessionId,
    });
  }
  return [...types.values()];
}

// ── Les colonnes ────────────────────────────────────────────────────────────────────────────

export const DosageColumnKind = {
  COPY: "COPY",
  /** Une semaine où la séance n'est pas posée : sa colonne reste, hachurée. */
  ABSENT: "ABSENT",
} as const;
export type DosageColumnKind = TypesValuesOf<typeof DosageColumnKind>;

export type DosageColumn =
  | {
      kind: typeof DosageColumnKind.COPY;
      copyId: string;
      weekNumber: number;
      deload: boolean;
      date: string;
      /** La séance est posée plusieurs fois cette semaine : la colonne se nomme aussi par son jour. */
      showDay: boolean;
      /** Débriefée : ses valeurs se lisent, mais ne se changent plus. */
      locked: boolean;
    }
  | { kind: typeof DosageColumnKind.ABSENT; weekNumber: number; deload: boolean };

/**
 * Une colonne par copie, semaine après semaine, dans l'ordre du calendrier — celui où les copies
 * arrivent. Une semaine sans la séance garde sa colonne : on voit où le cycle saute.
 */
export function dosageColumns(
  weeks: readonly Pick<PlanWeekDto, "id" | "weekNumber" | "type">[],
  copies: readonly DosageCopy[],
): DosageColumn[] {
  return [...weeks]
    .sort((left, right) => left.weekNumber - right.weekNumber)
    .flatMap((week): DosageColumn[] => {
      const deload = week.type === PlanWeekType.DELOAD;
      const placed = copies.filter((copy) => copy.planWeekId === week.id);
      if (placed.length === 0) {
        return [{ kind: DosageColumnKind.ABSENT, weekNumber: week.weekNumber, deload }];
      }
      return placed.map((copy) => ({
        kind: DosageColumnKind.COPY,
        copyId: copy.id,
        weekNumber: week.weekNumber,
        deload,
        date: copy.scheduledDate,
        showDay: placed.length > 1,
        locked: isDebriefed(copy),
      }));
    });
}

// ── Les lignes ──────────────────────────────────────────────────────────────────────────────

/** Les valeurs d'un bloc, dans l'ordre où Dosage les montre : combien, puis à quel rythme, puis les repos. */
export const DOSAGE_SETTINGS = [
  SettingValue.ROUNDS,
  SettingValue.CAP,
  SettingValue.EVERY,
  SettingValue.WORK,
  SettingValue.REST,
  SettingValue.REST_BETWEEN_EXERCISES,
  SettingValue.REST_BETWEEN_ROUNDS,
  SettingValue.LIMIT,
] as const satisfies readonly SettingValue[];

/**
 * Un exercice du bloc, tel qu'une copie au moins le porte. `rowId` désigne cette première copie :
 * c'est elle qui donne le titre de la ligne. `origin` y est lue : un ajout ou un remplaçant porte
 * la même clé dans chaque copie (#720).
 */
export type DosageExerciseLine = Pick<DosageExercise, "key" | "origin"> & {
  rowId: string;
  metrics: GridMetric[];
};

export type DosageGroup<B extends DosageBlock = DosageBlock> = {
  blockIndex: number;
  /** Le bloc de la première copie qui l'a : il donne le nom et le libellé du groupe. */
  block: B;
  /**
   * La séance-type reçue la plus complète — celle d'une semaine posée après qu'un exercice y est
   * entré : la phrase du groupe la lit, réglages et exercices ensemble.
   */
  reference: DosageBlock["baseline"];
  /**
   * Les clés des exercices que la séance-type a donnés, dans son ordre, réunies sur toutes les
   * copies : une semaine qui a remplacé A1 ne doit pas faire perdre son code aux autres.
   */
  received: string[];
  settings: SettingValue[];
  exercises: DosageExerciseLine[];
};

/**
 * Les groupes de Dosage, un par rang de bloc — au niveau planifié, les blocs ne bougent pas.
 *
 * - D'abord les exercices de la séance-type, dans son ordre ; puis ceux que certaines semaines
 *   seulement portent, ajouts et remplaçants, en fin de bloc.
 * - Un exercice qu'aucune copie ne porte plus — retiré partout — n'a rien à régler : il n'a pas de
 *   ligne. Pas plus qu'un bloc sans valeur ni métrique, comme un échauffement libre.
 */
export function dosageGroups<B extends DosageBlock>(
  copies: readonly (Omit<DosageCopy, "blocks"> & { blocks: readonly B[] })[],
): DosageGroup<B>[] {
  const blockCount = Math.max(0, ...copies.map((copy) => copy.blocks.length));
  return Array.from({ length: blockCount }, (_unused, blockIndex) => blockIndex).flatMap(
    (blockIndex): DosageGroup<B>[] => {
      const blocks = copies.flatMap((copy) => copy.blocks[blockIndex] ?? []);
      // Un rang en deçà du plus long existe dans au moins une copie.
      // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
      const block = required(blocks[0], "rang sans bloc");
      const settings = DOSAGE_SETTINGS.filter((field) =>
        blocks.some((each) => settingValues(each.settings)[field] !== null),
      );
      const received = [
        ...new Set(blocks.flatMap((each) => each.baseline.exercises.map(({ key }) => key))),
      ];
      const reference = blocks.reduce(
        (kept, each) =>
          each.baseline.exercises.length > kept.exercises.length ? each.baseline : kept,
        block.baseline,
      );
      const exercises = exerciseLines(blocks, received);
      const measured = exercises.some((exercise) => exercise.metrics.length > 0);
      if (settings.length === 0 && !measured) return [];
      return [{ blockIndex, block, reference, received, settings, exercises }];
    },
  );
}

function exerciseLines(
  blocks: readonly DosageBlock[],
  referenceKeys: readonly string[],
): DosageExerciseLine[] {
  const all = blocks.flatMap((block) => block.exercises);
  const received = referenceKeys.flatMap((key) =>
    all
      .filter(
        (exercise) => exercise.key === key && exercise.origin.kind === CompositionOrigin.RECEIVED,
      )
      .slice(0, 1),
  );
  const seen = new Set(received.map((exercise) => exercise.key));
  const extras = all.filter((exercise) => {
    if (seen.has(exercise.key)) return false;
    seen.add(exercise.key);
    return true;
  });
  return [...received, ...extras].map((exercise) => ({
    key: exercise.key,
    origin: exercise.origin,
    rowId: exercise.id,
    metrics: metricsOf(all.filter((each) => each.key === exercise.key)),
  }));
}

/**
 * Les colonnes d'un exercice, réunies sur toutes les copies qui le portent : une copie posée avant
 * qu'une colonne soit ajoutée à la séance-type ne doit pas la cacher aux autres semaines.
 */
function metricsOf(occurrences: readonly DosageExercise[]): GridMetric[] {
  const byId = new Map<string, GridMetric>();
  for (const metric of occurrences.flatMap((exercise) => exercise.grid.metrics)) {
    if (!byId.has(metric.id)) byId.set(metric.id, metric);
  }
  return [...byId.values()];
}

// ── Les cellules ────────────────────────────────────────────────────────────────────────────

export const DosageCellKind = {
  /** La colonne d'une semaine où la séance n'est pas posée. */
  ABSENT: "ABSENT",
  /** Rien à régler dans cette copie, pour la raison dite. */
  OFF: "OFF",
  VALUE: "VALUE",
} as const;
export type DosageCellKind = TypesValuesOf<typeof DosageCellKind>;

export const DosageOff = {
  REPLACED: "REPLACED",
  REMOVED: "REMOVED",
  /** Un ajout, ou un remplaçant, hors des semaines où il a été posé. */
  NOT_THIS_WEEK: "NOT_THIS_WEEK",
  /** La copie n'a pas cette valeur, ou ce bloc : posée avant une retouche de la séance-type. */
  NONE: "NONE",
} as const;
export type DosageOff = TypesValuesOf<typeof DosageOff>;

/**
 * `values` : une valeur par tour, série ou passage — une seule pour une valeur de bloc. `reference`
 * : celles de la séance-type reçue, au même rang, ou `null` pour un ajout ou un remplaçant, qui
 * n'ont rien à quoi revenir. `adjusted` porte le marqueur carré.
 */
export type DosageCell =
  | { kind: typeof DosageCellKind.ABSENT }
  | { kind: typeof DosageCellKind.OFF; reason: DosageOff }
  | {
      kind: typeof DosageCellKind.VALUE;
      values: MetricValue[];
      reference: MetricValue[] | null;
      adjusted: boolean;
    };

const ABSENT_CELL = { kind: DosageCellKind.ABSENT } as const;
const off = (reason: DosageOff) => ({ kind: DosageCellKind.OFF, reason }) as const;

function valueCell(values: MetricValue[], reference: MetricValue[] | null): DosageCell {
  const adjusted = reference !== null && values.some((value, index) => value !== reference[index]);
  return { kind: DosageCellKind.VALUE, values, reference, adjusted };
}

/** Une valeur du bloc dans une copie — `null` : une semaine où la séance n'est pas posée. */
export function dosageSettingCell(
  copy: DosageCopy | null,
  blockIndex: number,
  field: SettingValue,
): DosageCell {
  if (copy === null) return ABSENT_CELL;
  const block = copy.blocks[blockIndex];
  const value = block === undefined ? null : settingValues(block.settings)[field];
  if (block === undefined || value === null) return off(DosageOff.NONE);
  return valueCell([value], [settingValues(block.baseline.settings)[field]]);
}

/**
 * Les tours d'un exercice dans son bloc, ou `null` quand le bloc est à régler — « un seul par… »
 * manque de bips : ses tours ne se répartissent plus, et le serveur le refuse.
 */
function rowLimitOf(block: DosageBlock, exerciseIndex: number): number | null {
  const count = block.exercises.length;
  if (roundsError(block.settings, count) != null) return null;
  return gridRowLimit(block.settings, count, exerciseIndex);
}

/**
 * Les blocs d'une copie dont les tours ne suffisent plus : « un seul par bip » avec moins de bips
 * que d'exercices. L'API refuserait tout l'envoi ; Dosage le dit avant, bloc par bloc.
 */
export function dosageRoundsIssues(
  copy: Pick<DosageCopy, "blocks">,
): { blockIndex: number; phrase: Phrase }[] {
  return copy.blocks.flatMap((block, blockIndex) => {
    const phrase = roundsError(block.settings, block.exercises.length);
    return phrase == null ? [] : [{ blockIndex, phrase }];
  });
}

/** Les séries qu'une cellule montre : au moins une, même quand le bloc est à régler. */
const toursOf = (block: DosageBlock, exerciseIndex: number) =>
  rowLimitOf(block, exerciseIndex) ?? 1;

const seriesOf = (grid: BlockGrid, tours: number, metricId: string) =>
  Array.from({ length: tours }, (_unused, rowIndex) => gridValueAt(grid, rowIndex, metricId));

/**
 * Une métrique d'exercice dans une copie : ses séries, tour par tour. La dernière ligne de la
 * grille vaut pour les tours qui suivent : un tour de plus la reprend, et ne compte pas comme
 * ajusté.
 */
export function dosageMetricCell(
  copy: DosageCopy | null,
  blockIndex: number,
  key: string,
  metricId: string,
): DosageCell {
  if (copy === null) return ABSENT_CELL;
  const block = copy.blocks[blockIndex];
  if (block === undefined) return off(DosageOff.NONE);
  const exerciseIndex = block.exercises.findIndex((exercise) => exercise.key === key);
  const exercise = block.exercises[exerciseIndex];
  if (exercise === undefined) return off(absence(block, key));
  if (!exercise.grid.metrics.some((metric) => metric.id === metricId)) return off(DosageOff.NONE);

  const tours = toursOf(block, exerciseIndex);
  const base =
    exercise.origin.kind === CompositionOrigin.RECEIVED
      ? block.baseline.exercises.find((each) => each.key === key)
      : undefined;
  return valueCell(
    seriesOf(exercise.grid, tours, metricId),
    base === undefined ? null : seriesOf(base.grid, tours, metricId),
  );
}

function absence(block: DosageBlock, key: string): DosageOff {
  const replaced = block.exercises.some(
    (exercise) =>
      exercise.origin.kind === CompositionOrigin.REPLACEMENT && exercise.origin.replacesKey === key,
  );
  if (replaced) return DosageOff.REPLACED;
  const received = block.baseline.exercises.some((exercise) => exercise.key === key);
  return received ? DosageOff.REMOVED : DosageOff.NOT_THIS_WEEK;
}

/**
 * Ce qu'une cellule affiche : une seule valeur quand toutes ses séries la portent, sinon chacune
 * dans l'ordre — « 60 / 60 / 62,5 kg ».
 */
export function shownSeries(values: readonly MetricValue[]): MetricValue[] {
  return values.every((value) => value === values[0]) ? values.slice(0, 1) : [...values];
}

/** Le compte d'une colonne : les valeurs ajustées pour l'athlète, comme `plannedChanges` les compte. */
export function dosageAdjustedCount(copy: DosageCopy): number {
  return plannedChanges(
    copy.blocks.map((block) => block.baseline),
    copy.blocks,
  ).values.length;
}

// ── Les gestes ──────────────────────────────────────────────────────────────────────────────

/** Une valeur du bloc. Baisser les tours ne retire aucune ligne avant l'envoi (`dosageInput`). */
export function withDosageSetting<B extends DosageBlock>(
  blocks: readonly B[],
  blockIndex: number,
  field: SettingValue,
  amount: number,
): B[] {
  return blocks.map((block, index) =>
    index === blockIndex
      ? { ...block, settings: withSettingValue(block.settings, field, amount) }
      : block,
  );
}

/**
 * Toutes les séries d'une métrique, une valeur par tour (`values`). La grille ne gagne que les
 * lignes qu'il faut : la dernière vaut pour les tours suivants, donc une ligne n'est créée que si
 * un tour après elle doit valoir autre chose. Une ligne créée reprend la précédente.
 */
export function withDosageCell<B extends DosageBlock>(
  blocks: readonly B[],
  blockIndex: number,
  key: string,
  metricId: string,
  values: readonly MetricValue[],
  newId: (index: number) => string,
): B[] {
  return blocks.map((block, index) =>
    index === blockIndex
      ? {
          ...block,
          exercises: block.exercises.map((exercise) =>
            exercise.key === key
              ? { ...exercise, grid: withSeries(exercise.grid, metricId, values, newId) }
              : exercise,
          ),
        }
      : block,
  );
}

function withSeries(
  grid: BlockGrid,
  metricId: string,
  values: readonly MetricValue[],
  newId: (index: number) => string,
): BlockGrid {
  // La plus courte grille dont la dernière ligne vaut pour tous les tours restants.
  const last = values.at(-1) ?? null;
  let needed = values.length;
  while (needed > 1 && values[needed - 2] === last) needed -= 1;
  const rows = withMaterializedSeries(grid.rows, Math.max(grid.rows.length, needed) - 1, newId).map(
    (row, rowIndex) =>
      rowIndex < values.length ? withValue(row, metricId, values[rowIndex]) : row,
  );
  return { ...grid, rows };
}

/** Une cellule vidée ne garde pas de clé : vide se lit « — », comme une valeur jamais saisie. */
function withValue(row: GridRow, metricId: string, value: MetricValue | undefined): GridRow {
  const { [metricId]: _dropped, ...rest } = row.values;
  return { ...row, values: value == null ? rest : { ...rest, [metricId]: value } };
}

/**
 * « Revenir à la séance-type » pour une copie : les valeurs reçues, bloc par bloc. La composition
 * ne bouge pas — elle se règle dans le panneau (#720) : un ajout ou un remplaçant garde les siennes,
 * qu'aucune référence ne porte.
 */
export function revertedDosage<B extends DosageBlock>(blocks: readonly B[]): B[] {
  return blocks.map((block) => ({
    ...block,
    settings: block.baseline.settings,
    exercises: block.exercises.map((exercise) => {
      if (exercise.origin.kind !== CompositionOrigin.RECEIVED) return exercise;
      const base = block.baseline.exercises.find((each) => each.key === exercise.key);
      return base === undefined ? exercise : { ...exercise, grid: base.grid };
    }),
  }));
}

// ── L'envoi ─────────────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'« Enregistrer » envoie : les copies dont une valeur a changé, sous la version lue, chaque
 * grille taillée à ses tours — les lignes au-delà, que le brouillon gardait, ne se jouent pas.
 */
export function dosageInput(
  drafts: readonly DosageCopy[],
  saved: readonly DosageCopy[],
): DosageSessionInput[] {
  return drafts.flatMap((draft) => {
    const before = saved.find((copy) => copy.id === draft.id);
    if (before === undefined || sameJson(playedValues(before.blocks), playedValues(draft.blocks))) {
      return [];
    }
    return [
      {
        id: draft.id,
        expectedUpdatedAt: before.updatedAt,
        blocks: draft.blocks.map((block) => ({
          id: block.id,
          settings: block.settings,
          exercises: block.exercises.map((exercise, index) => ({
            key: exercise.key,
            grid: fittedGrid(block, exercise.grid, index),
          })),
        })),
      },
    ];
  });
}

/** La grille taillée à ses tours — intacte quand le bloc est à régler, que le serveur refuse. */
function fittedGrid(block: DosageBlock, grid: BlockGrid, exerciseIndex: number): BlockGrid {
  const limit = rowLimitOf(block, exerciseIndex);
  return limit === null ? grid : { ...grid, rows: grid.rows.slice(0, limit) };
}

/**
 * Ce que les valeurs d'une copie DISENT : les réglages, et chaque série jouée. Deux grilles qui
 * jouent les mêmes séries se valent, même si l'une a gagné des lignes en route — une valeur changée
 * puis remise n'est pas un changement, et ne s'annonce pas à l'athlète.
 */
function playedValues(blocks: readonly DosageBlock[]) {
  return blocks.map((block) => ({
    settings: block.settings,
    exercises: block.exercises.map((exercise, index) =>
      exercise.grid.metrics.map((metric) =>
        seriesOf(exercise.grid, toursOf(block, index), metric.id),
      ),
    ),
  }));
}

import type { BlockGrid, GridMetric } from "../dto/block-grid.schema";
import { fittingColumnCount, MetricSource } from "../dto/exercise-block.schema";
import { MetricKey, MetricUnit, type MetricValue } from "../dto/exercise-metric.schema";
import type { StructureSettings } from "../dto/structure.schema";
import { StructureAdvance, StructureRepeat } from "../dto/structure-answer.schema";
import type { TypesValuesOf } from "../type/generics.type";
import type { Phrase } from "./phrase.util";
import { oneAtATime } from "./structure-settings.util";

// Ce que lit l'athlète d'un bloc (#715), repris de `structure_model.js` : `readBlocks`, `gridOf`,
// `lineText`, `flowOf` et `timerOf`. L'athlète lit toujours sa séance PLANIFIÉE, sans aucune trace
// des ajustements : rien ici ne regarde l'origine d'un exercice.

// ── Le numéro du bloc et les codes de ses exercices ─────────────────────────────────────────

/**
 * Le numéro de chaque bloc, ou `null` pour un bloc à libellé : il affiche son libellé, sans
 * numéro. Les blocs sans libellé se suivent — 1, 2, 3 — même si un bloc à libellé les sépare.
 */
export function blockNumbers(blocks: readonly { label: string | null }[]): (string | null)[] {
  let next = 0;
  return blocks.map((block) => (block.label == null ? String(++next) : null));
}

/** 1.1, 1.2… pour un bloc numéroté ; aucun code (`null`) pour un bloc à libellé. */
export function exerciseCodes(number: string | null, exerciseCount: number): (string | null)[] {
  return Array.from({ length: exerciseCount }, (_unused, index) =>
    number == null ? null : `${number}.${index + 1}`,
  );
}

// ── La grille ───────────────────────────────────────────────────────────────────────────────

export const GridLayout = {
  /** Aucune valeur : l'athlète lit le nom, la phrase du bloc et la note. */
  NONE: "NONE",
  /** Une seule ligne, ou des lignes toutes identiques : elle se lit comme une phrase. */
  LINE: "LINE",
  /** Un mini-tableau, une ligne par tour — tant que les colonnes tiennent. */
  TABLE: "TABLE",
  /** Une carte par ligne : jamais de défilement horizontal. */
  CARDS: "CARDS",
} as const;
export type GridLayout = TypesValuesOf<typeof GridLayout>;

/** Une cellule : sa colonne et sa valeur, `null` quand elle est vide (lue « — »). */
export type GridCell = { metric: GridMetric; value: MetricValue };

export type GridReading =
  | { layout: typeof GridLayout.NONE }
  | { layout: typeof GridLayout.LINE; each: Phrase | null; cells: GridCell[] }
  | {
      layout: typeof GridLayout.TABLE | typeof GridLayout.CARDS;
      rows: { label: Phrase; cells: GridCell[] }[];
    };

/** Une ligne de valeurs en cellules, une par colonne, vide (`null`) là où rien n'est saisi. */
export function gridCells(
  grid: BlockGrid,
  values: Readonly<Record<string, MetricValue>>,
): GridCell[] {
  return grid.metrics.map((metric) => ({ metric, value: values[metric.id] ?? null }));
}

function sameCells(a: readonly GridCell[], b: readonly GridCell[]): boolean {
  // Stryker disable next-line OptionalChaining: les lignes d'une grille ont toutes une cellule par colonne
  return a.every((cell, index) => cell.value === b[index]?.value);
}

/**
 * Comment se lisent les valeurs d'un exercice :
 *  - aucune colonne, ou aucune cellule remplie : pas de grille ;
 *  - une ligne, ou des lignes toutes identiques : une phrase, « À chaque tour : 6 répétitions à
 *    60 kg » (`each` est `null` pour un bloc fait une seule fois) ;
 *  - sinon un tableau tant que les colonnes tiennent sur un écran étroit (`fittingColumnCount`,
 *    le seuil inchangé), des cartes au-delà.
 *
 * Dès qu'une cellule est remplie la grille s'affiche, et une cellule vide y vaut « — ».
 */
export function gridReading(
  grid: BlockGrid,
  settings: StructureSettings,
  exerciseCount: number,
): GridReading {
  const rows = grid.rows.map((row) => gridCells(grid, row.values));
  if (!rows.some((cells) => cells.some((cell) => cell.value != null))) {
    return { layout: GridLayout.NONE };
  }

  // Stryker disable next-line ArrayDeclaration: une grille sans ligne n'a aucune cellule remplie, elle s'arrête au-dessus
  const [first = [], ...others] = rows;
  if (others.every((cells) => sameCells(cells, first))) {
    return { layout: GridLayout.LINE, each: eachPhrase(settings, exerciseCount), cells: first };
  }

  const layout = grid.metrics.length <= fittingColumnCount() ? GridLayout.TABLE : GridLayout.CARDS;
  return {
    layout,
    rows: rows.map((cells, index) => ({
      label: rowLabel(settings, exerciseCount, index + 1),
      cells,
    })),
  };
}

function eachPhrase(settings: StructureSettings, exerciseCount: number): Phrase | null {
  if (settings.repeat.kind === StructureRepeat.ONCE) return null;
  if (oneAtATime(settings, exerciseCount)) {
    return settings.advance.kind === StructureAdvance.BEEP
      ? { key: "block.grid.eachBeep", params: {} }
      : { key: "block.grid.eachInterval", params: {} };
  }
  return exerciseCount === 1
    ? { key: "block.grid.eachSet", params: {} }
    : { key: "block.grid.eachRound", params: {} };
}

/** « Série 2 » avec un exercice, « Tour 2 » à partir de deux, « Passage 2 » avec « un seul par… ». */
function rowLabel(settings: StructureSettings, exerciseCount: number, index: number): Phrase {
  if (oneAtATime(settings, exerciseCount)) return { key: "block.grid.pass", params: { index } };
  return exerciseCount === 1
    ? { key: "block.grid.set", params: { index } }
    : { key: "block.grid.round", params: { index } };
}

/**
 * Ce que l'app sait d'une cellule, écrit dans sa langue : le nom de la colonne (`metricLabel`), la
 * valeur sans unité (`formatMetricValue`) et l'unité, `null` sans unité (`metricUnitLabel`).
 */
export type GridCellText = { label: string; value: string; unit: string | null };

function isCatalog(metric: GridMetric, key: MetricKey): boolean {
  // Stryker disable next-line ConditionalExpression: une métrique du Coach n'a pas de clé
  return metric.source === MetricSource.CATALOG && metric.key === key;
}

/**
 * Une ligne de valeurs en phrase, morceaux à mettre bout à bout (`translatePhrases`) : « 6
 * répétitions à 60 kg », « 1'30 d'effort », « 5 répétitions, charge — ».
 *
 * `describe` fournit le nom de la colonne — tel qu'il doit apparaître devant le tiret — et la
 * valeur écrite : ils dépendent des métriques du Coach et de la langue, que l'app détient.
 */
export function gridLinePhrases(
  cells: readonly GridCell[],
  describe: (cell: GridCell) => GridCellText,
): Phrase[] {
  return cells.flatMap((cell, index) => {
    const phrase = cellPhrase(cell, describe(cell));
    const previous = cells[index - 1];
    if (previous == null) return [phrase];
    return [joinerPhrase(previous, cell), phrase];
  });
}

/**
 * Des répétitions s'accordent au nombre, en tout comme par côté : « 1 répétition », « 1 répétition
 * par côté », « 6 répétitions ». Toute autre unité suit la valeur telle quelle : « 60 kg ».
 */
function cellPhrase(cell: GridCell, described: GridCellText): Phrase {
  const { label, value, unit } = described;
  if (cell.value == null) return { key: "block.grid.emptyCell", params: { metric: label } };
  const { metric } = cell;
  const counted =
    typeof cell.value === "number" ? repetitionsPhrase(metric, cell.value, value) : null;
  if (counted != null) return counted;
  if (isCatalog(metric, MetricKey.EFFORT_DURATION)) {
    return { key: "block.grid.effort", params: { value } };
  }
  if (unit == null) return { key: "block.grid.value", params: { value } };
  return { key: "block.grid.valueWithUnit", params: { value, unit } };
}

/**
 * Seules les répétitions se comptent en `REPS` ou `REPS_PER_SIDE` (`METRIC_CATALOG`) : l'unité
 * suffit à les reconnaître. `null` pour toute autre métrique.
 */
function repetitionsPhrase(metric: GridMetric, count: number, value: string): Phrase | null {
  // Stryker disable next-line ConditionalExpression: une métrique du Coach n'a pas d'unité de catalogue
  if (metric.source !== MetricSource.CATALOG) return null;
  if (metric.unit === MetricUnit.REPS) {
    return { key: "block.grid.repetitions", params: { count, value } };
  }
  if (metric.unit === MetricUnit.REPS_PER_SIDE) {
    return { key: "block.grid.repetitionsPerSide", params: { count, value } };
  }
  return null;
}

/** « à » entre des répétitions et leur charge, toutes deux remplies ; une virgule sinon. */
function joinerPhrase(previous: GridCell, cell: GridCell): Phrase {
  const repsAtLoad =
    isCatalog(previous.metric, MetricKey.REPETITIONS) &&
    isCatalog(cell.metric, MetricKey.LOAD) &&
    previous.value != null &&
    cell.value != null;
  return repsAtLoad
    ? { key: "block.grid.joinAt", params: {} }
    : { key: "block.grid.joinComma", params: {} };
}

// ── L'enchaînement ──────────────────────────────────────────────────────────────────────────

/**
 * « A1, A2 et A3 à la suite, puis on recommence. » — quand au moins deux exercices se font à la
 * suite, tour après tour. `null` avec un seul exercice, « un seul par… » ou un bloc fait une fois.
 */
export function flowPhrase(settings: StructureSettings, labels: readonly string[]): Phrase | null {
  if (labels.length < 2) return null;
  if (oneAtATime(settings, labels.length) || settings.repeat.kind === StructureRepeat.ONCE) {
    return null;
  }
  return { key: "block.flow", params: { labels } };
}

// ── Le chrono ───────────────────────────────────────────────────────────────────────────────

export const ClockKind = {
  /** Quand l'athlète a fini : un repos se lance entre deux tours ou deux exercices. */
  REST: "REST",
  /** À chaque bip : un compte à rebours jusqu'au bip suivant. */
  BEEP: "BEEP",
  /** Effort puis repos imposés, alternés. */
  CYCLE: "CYCLE",
  /** Autant que possible : un compte à rebours de la limite, sans compteur de tours. */
  CAP: "CAP",
  /** Un nombre de tours avec une limite : un chrono qui monte, limite visible, sans compteur. */
  UP: "UP",
} as const;
export type ClockKind = TypesValuesOf<typeof ClockKind>;

export type BlockClock =
  | { kind: typeof ClockKind.CAP; capSeconds: number }
  | { kind: typeof ClockKind.BEEP; everySeconds: number }
  | { kind: typeof ClockKind.CYCLE; workSeconds: number; restSeconds: number }
  | { kind: typeof ClockKind.UP; limitSeconds: number }
  | {
      kind: typeof ClockKind.REST;
      restBetweenRoundsSeconds: number | null;
      restBetweenExercisesSeconds: number | null;
    };

/**
 * Le chrono du bloc, déduit de ses réglages. Il aide l'athlète : rien de ce qu'il mesure n'est
 * enregistré ni envoyé au Coach.
 *
 * `null` quand il n'y a rien à chronométrer — une seule fois, sans limite ni repos : inventer un
 * temps ferait passer une supposition pour une consigne (règle dure n°5).
 *
 * Un chrono qui tourne déjà — compte à rebours, limite — ne lance pas les repos, comme dans la
 * maquette : ils se prennent dans le temps qui court.
 */
export function blockClock(settings: StructureSettings, exerciseCount: number): BlockClock | null {
  const { advance, repeat } = settings;
  if (repeat.kind === StructureRepeat.MAX) {
    return { kind: ClockKind.CAP, capSeconds: repeat.capSeconds };
  }
  if (advance.kind === StructureAdvance.BEEP) {
    return { kind: ClockKind.BEEP, everySeconds: advance.everySeconds };
  }
  if (advance.kind === StructureAdvance.CYCLE) {
    return {
      kind: ClockKind.CYCLE,
      workSeconds: advance.workSeconds,
      restSeconds: advance.restSeconds,
    };
  }
  if (settings.limitSeconds != null) {
    return { kind: ClockKind.UP, limitSeconds: settings.limitSeconds };
  }
  const betweenRounds =
    repeat.kind === StructureRepeat.ROUNDS ? settings.restBetweenRoundsSeconds : null;
  const betweenExercises = exerciseCount > 1 ? settings.restBetweenExercisesSeconds : null;
  if (betweenRounds == null && betweenExercises == null) return null;
  return {
    kind: ClockKind.REST,
    restBetweenRoundsSeconds: betweenRounds,
    restBetweenExercisesSeconds: betweenExercises,
  };
}

/**
 * La ligne du compteur, qui parle comme la phrase du bloc : « Série 3 / 6 » (un exercice),
 * « Tour 3 / 10 » (à partir de deux), « Bip 4 / 10 · Burpees » (un seul par bip), « Intervalle
 * 5 / 8 · … ». `index` compte à partir de 1.
 *
 * `null` sans nombre de tours — autant que possible, chrono qui monte — ou sans chrono.
 */
export function clockCounter(
  settings: StructureSettings,
  exerciseCount: number,
  index: number,
  names: readonly string[] = [],
): Phrase | null {
  const clock = blockClock(settings, exerciseCount);
  const { repeat } = settings;
  if (clock == null || clock.kind === ClockKind.UP || repeat.kind !== StructureRepeat.ROUNDS) {
    return null;
  }

  const total = repeat.rounds;
  if (!oneAtATime(settings, exerciseCount)) {
    return exerciseCount === 1
      ? { key: "block.counter.set", params: { index, total } }
      : { key: "block.counter.round", params: { index, total } };
  }

  const beep = settings.advance.kind === StructureAdvance.BEEP;
  const name = names[(index - 1) % exerciseCount];
  if (name == null) {
    return beep
      ? { key: "block.counter.beep", params: { index, total } }
      : { key: "block.counter.interval", params: { index, total } };
  }
  return beep
    ? { key: "block.counter.beepNamed", params: { index, total, name } }
    : { key: "block.counter.intervalNamed", params: { index, total, name } };
}

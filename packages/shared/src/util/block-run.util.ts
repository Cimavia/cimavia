import type { BlockGrid } from "../dto/block-grid.schema";
import { MetricSource } from "../dto/exercise-block.schema";
import { MetricKey } from "../dto/exercise-metric.schema";
import type { StructureSettings } from "../dto/structure.schema";
import { StructureRepeat } from "../dto/structure-answer.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { blockClock, ClockKind, type GridCell, gridCells } from "./block-reading.util";
import { oneAtATime } from "./structure-settings.util";

// Le déroulé du chrono d'un bloc (#722), étape par étape : ce que `blockClock` résume en un mot,
// déplié pour qu'un écran le joue. Il aide l'athlète et rien de plus : aucune étape ne coche une
// case, et rien de ce qu'il mesure n'est enregistré (#725).

export const RunStepKind = {
  /** Un exercice qui dure ce qu'il dure : le chrono attend que l'athlète dise qu'il a fini. */
  DO: "DO",
  /** Un repos imposé, entre deux exercices, deux tours ou deux efforts. */
  REST: "REST",
  /** Le temps jusqu'au prochain bip. */
  BEEP: "BEEP",
  /** L'effort d'un cycle effort puis repos. */
  EFFORT: "EFFORT",
  /** Le compte à rebours d'un « autant que possible ». */
  CAP: "CAP",
  /** Le chrono qui monte jusqu'à la limite d'un bloc à tours. */
  UP: "UP",
} as const;
export type RunStepKind = TypesValuesOf<typeof RunStepKind>;

export type RunStep = {
  kind: RunStepKind;
  /** `0` pour `DO` : il n'a pas de durée, il attend un geste. */
  seconds: number;
  /**
   * Le rang de l'étape pour le compteur (`clockCounter`), compté depuis 1 : le tour, la série, le
   * bip ou l'intervalle. Un repos porte celui qui VIENT : « Tour 2 / 4 » pendant qu'on récupère.
   */
  index: number;
  /**
   * L'exercice à faire — ou, pendant un repos, celui qui vient (« Ensuite »). `null` quand
   * l'étape les couvre tous : un bip où tout s'enchaîne, un compte à rebours.
   */
  exerciseIndex: number | null;
  /** La ligne de la grille de cet exercice, comptée depuis 0 ; `null` avec `exerciseIndex`. */
  row: number | null;
};

/**
 * Les étapes du chrono d'un bloc, dans l'ordre où il les joue. Vide quand le bloc n'a rien à
 * chronométrer — ni chrono de structure, ni durée dans la grille : pas de barre « Lancer le chrono ».
 *
 *  - à son rythme : chaque exercice attend « J'ai fini », puis le repos entre exercices ou entre
 *    tours. La grille y a le dernier mot, ligne par ligne, comme pour l'ancien chrono (*Tranché —
 *    le repos par ligne passe par une COLONNE*) : sa colonne de repos l'emporte sur celui de la
 *    structure, et sa durée d'effort fait d'un exercice un compte à rebours ;
 *  - bip : un compte à rebours par bip, sur un exercice avec « un seul par bip » ;
 *  - cycle : effort puis repos, sans repos après le dernier effort ;
 *  - autant que possible : un seul compte à rebours ; limite : un seul chrono qui monte.
 */
export function blockRun(
  settings: StructureSettings,
  exerciseCount: number,
  /** La grille de chaque exercice, dans l'ordre : ses durées comptent à son rythme. */
  grids: readonly BlockGrid[],
): RunStep[] {
  const clock = blockClock(settings, exerciseCount);
  if (clock == null || clock.kind === ClockKind.REST)
    return paceRun(settings, exerciseCount, grids);
  switch (clock.kind) {
    case ClockKind.CAP:
      return [whole(RunStepKind.CAP, clock.capSeconds)];
    case ClockKind.UP:
      return [whole(RunStepKind.UP, clock.limitSeconds)];
    case ClockKind.BEEP:
      return passes(settings, exerciseCount).map((pass) => ({
        kind: RunStepKind.BEEP,
        seconds: clock.everySeconds,
        ...pass,
      }));
    case ClockKind.CYCLE:
      return passes(settings, exerciseCount).flatMap((pass, position, all) => {
        const effort: RunStep = { kind: RunStepKind.EFFORT, seconds: clock.workSeconds, ...pass };
        const next = all[position + 1];
        if (next == null) return [effort];
        return [effort, { kind: RunStepKind.REST, seconds: clock.restSeconds, ...next }];
      });
  }
}

function whole(kind: RunStepKind, seconds: number): RunStep {
  return { kind, seconds, index: 1, exerciseIndex: null, row: null };
}

type Pass = Pick<RunStep, "index" | "exerciseIndex" | "row">;

/**
 * Les bips ou les intervalles d'un bloc à tours. Avec « un seul par… », chacun revient à un
 * exercice, à tour de rôle, et le passage de cet exercice choisit sa ligne ; un exercice seul est
 * désigné de même, à chaque passage. Sinon tout s'enchaîne dans chacun, sans exercice désigné.
 */
function passes(settings: StructureSettings, exerciseCount: number): Pass[] {
  // Un bip ou un cycle n'existe qu'avec un nombre de tours : les autres réponses sont grisées.
  const total = settings.repeat.kind === StructureRepeat.ROUNDS ? settings.repeat.rounds : 1;
  // Un exercice seul est celui de chaque passage, qu'on les fasse « un par un » ou « tous ».
  const single = exerciseCount === 1 || oneAtATime(settings, exerciseCount);
  return Array.from({ length: total }, (_unused, position) =>
    single
      ? {
          index: position + 1,
          exerciseIndex: position % exerciseCount,
          row: Math.floor(position / exerciseCount),
        }
      : { index: position + 1, exerciseIndex: null, row: null },
  );
}

/**
 * Un bloc fait à son rythme : chaque exercice attend « J'ai fini » — ou se joue en compte à
 * rebours quand la grille lui donne une durée d'effort —, puis le repos qui suit. Le repos d'une
 * ligne vient de la grille d'abord : « Repos entre séries » suit son exercice, « Repos entre
 * tours » clôt le tour ; la structure ne le donne qu'à défaut. Rien après la dernière étape.
 */
function paceRun(
  settings: StructureSettings,
  exerciseCount: number,
  grids: readonly BlockGrid[],
): RunStep[] {
  const rounds = settings.repeat.kind === StructureRepeat.ROUNDS ? settings.repeat.rounds : null;
  const pace: Pace = {
    grids,
    exerciseCount,
    betweenExercises: exerciseCount > 1 ? settings.restBetweenExercisesSeconds : null,
    betweenRounds: rounds == null ? null : settings.restBetweenRoundsSeconds,
  };
  const total = (rounds ?? 1) * exerciseCount;
  const steps = Array.from({ length: total }, (_unused, position) => {
    const round = Math.floor(position / exerciseCount) + 1;
    const exercise = position % exerciseCount;
    const done = doStep(pace, round, exercise);
    // Rien après la dernière étape.
    const after = position === total - 1 ? null : restAfter(pace, round, exercise);
    return after == null ? [done] : [done, after];
  }).flat();
  // Ni repos ni effort nulle part : il n'y a rien à chronométrer, seulement des « J'ai fini ».
  return steps.some((step) => step.seconds > 0) ? steps : [];
}

type Pace = {
  grids: readonly BlockGrid[];
  exerciseCount: number;
  /** Les repos de la structure, à défaut de ceux de la grille. */
  betweenExercises: number | null;
  betweenRounds: number | null;
};

/** L'exercice à faire : « J'ai fini », ou un compte à rebours si sa ligne a une durée d'effort. */
function doStep(pace: Pace, round: number, exercise: number): RunStep {
  const row = round - 1;
  const effort = gridSeconds(pace.grids[exercise], row, MetricKey.EFFORT_DURATION);
  return effort == null
    ? { kind: RunStepKind.DO, seconds: 0, index: round, exerciseIndex: exercise, row }
    : { kind: RunStepKind.EFFORT, seconds: effort, index: round, exerciseIndex: exercise, row };
}

/** Le repos qui suit un exercice, ou `null` quand ni la grille ni la structure n'en donnent. */
function restAfter(pace: Pace, round: number, exercise: number): RunStep | null {
  const row = round - 1;
  const afterSet = gridSeconds(pace.grids[exercise], row, MetricKey.REST_BETWEEN_SETS);
  if (exercise < pace.exerciseCount - 1) {
    const seconds = afterSet ?? pace.betweenExercises;
    return seconds == null ? null : rest(seconds, round, exercise + 1);
  }
  const seconds = roundRest(pace.grids, row) ?? afterSet ?? pace.betweenRounds;
  return seconds == null ? null : rest(seconds, round + 1, 0);
}

/** Le repos entre tours que porte la grille d'un des exercices, à cette ligne. */
function roundRest(grids: readonly BlockGrid[], row: number): number | null {
  for (const grid of grids) {
    const seconds = gridSeconds(grid, row, MetricKey.REST_BETWEEN_ROUNDS);
    if (seconds != null) return seconds;
  }
  return null;
}

/**
 * La durée qu'une colonne du catalogue donne à une ligne — la dernière valant pour les tours
 * suivants (#715). `null` sans cette colonne, ou sans valeur à cette ligne.
 */
function gridSeconds(grid: BlockGrid | undefined, row: number, key: MetricKey): number | null {
  const column = grid?.metrics.find(
    (metric) => metric.source === MetricSource.CATALOG && metric.key === key,
  );
  if (grid == null || column == null) return null;
  const value = grid.rows[Math.min(row, grid.rows.length - 1)]?.values[column.id];
  return typeof value === "number" ? value : null;
}

function rest(seconds: number, round: number, exerciseIndex: number): RunStep {
  return { kind: RunStepKind.REST, seconds, index: round, exerciseIndex, row: round - 1 };
}

/**
 * Les valeurs d'une ligne de grille à jouer : la dernière vaut pour les tours suivants, comme
 * partout (#715). `null` sans ligne, ou quand elle n'a aucune valeur — il n'y a rien à rappeler.
 */
export function gridCellsAt(grid: BlockGrid, row: number): GridCell[] | null {
  const line = grid.rows[Math.min(row, grid.rows.length - 1)];
  if (line == null) return null;
  const cells = gridCells(grid, line.values);
  return cells.some((cell) => cell.value != null) ? cells : null;
}

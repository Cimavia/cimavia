import type { BlockGrid } from "../dto/block-grid.schema";
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
 * chronométrer (`blockClock` à `null`) : pas de barre « Lancer le chrono ».
 *
 *  - repos : chaque exercice attend « J'ai fini », puis le repos entre exercices ou entre tours ;
 *  - bip : un compte à rebours par bip, sur un exercice avec « un seul par bip » ;
 *  - cycle : effort puis repos, sans repos après le dernier effort ;
 *  - autant que possible : un seul compte à rebours ; limite : un seul chrono qui monte.
 */
export function blockRun(settings: StructureSettings, exerciseCount: number): RunStep[] {
  const clock = blockClock(settings, exerciseCount);
  if (clock == null) return [];
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
    case ClockKind.REST:
      return restRun(
        settings.repeat.kind === StructureRepeat.ROUNDS ? settings.repeat.rounds : 1,
        exerciseCount,
        clock.restBetweenExercisesSeconds,
        clock.restBetweenRoundsSeconds,
      );
  }
}

function whole(kind: RunStepKind, seconds: number): RunStep {
  return { kind, seconds, index: 1, exerciseIndex: null, row: null };
}

type Pass = Pick<RunStep, "index" | "exerciseIndex" | "row">;

/**
 * Les bips ou les intervalles d'un bloc à tours. Avec « un seul par… », chacun revient à un
 * exercice, à tour de rôle, et le passage de cet exercice choisit sa ligne. Sinon tout s'enchaîne
 * dans chacun, sans exercice désigné.
 */
function passes(settings: StructureSettings, exerciseCount: number): Pass[] {
  // Un bip ou un cycle n'existe qu'avec un nombre de tours : les autres réponses sont grisées.
  const total = settings.repeat.kind === StructureRepeat.ROUNDS ? settings.repeat.rounds : 1;
  const single = oneAtATime(settings, exerciseCount);
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

function restRun(
  rounds: number,
  exerciseCount: number,
  betweenExercises: number | null,
  betweenRounds: number | null,
): RunStep[] {
  const steps: RunStep[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (let exercise = 0; exercise < exerciseCount; exercise++) {
      steps.push({
        kind: RunStepKind.DO,
        seconds: 0,
        index: round,
        exerciseIndex: exercise,
        row: round - 1,
      });
      const lastOfRound = exercise === exerciseCount - 1;
      if (!lastOfRound && betweenExercises != null) {
        steps.push(rest(betweenExercises, round, exercise + 1));
      }
      if (lastOfRound && round < rounds && betweenRounds != null) {
        steps.push(rest(betweenRounds, round + 1, 0));
      }
    }
  }
  return steps;
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

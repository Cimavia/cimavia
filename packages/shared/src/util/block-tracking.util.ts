import type { SessionBlockTracking } from "../dto/block-tracking.schema";
import { StructureAdvance, StructureRepeat, type StructureSettings } from "../dto/structure.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { required } from "./invariant.util";
import type { Phrase } from "./phrase.util";
import { oneAtATime } from "./structure-settings.util";

// Le suivi coché d'un bloc (#715), repris de `structure_model.js` : `checksOf`, `tally` et
// `suiviNote`. Ouvert tout le temps : une séance à venir se coche, une séance débriefée reste
// cochable.

/** Ce que compte une case. */
export const CheckUnit = {
  EXERCISE: "EXERCISE",
  BEEP: "BEEP",
  INTERVAL: "INTERVAL",
  SET: "SET",
  ROUND: "ROUND",
} as const;
export type CheckUnit = TypesValuesOf<typeof CheckUnit>;

export const CheckBoxKind = {
  /** La case d'un exercice, par son rang dans le bloc. */
  EXERCISE: "EXERCISE",
  /** « Bloc fait » : la seule case d'un bloc autant que possible. */
  BLOCK: "BLOCK",
} as const;

export type CheckBox =
  | { kind: typeof CheckBoxKind.EXERCISE; exerciseIndex: number }
  | { kind: typeof CheckBoxKind.BLOCK };

export type BlockChecks = {
  /** `null` pour « Bloc fait » : le nombre de tours d'un AMRAP n'est pas noté. */
  unit: CheckUnit | null;
  /** Une rangée par tour, une case par exercice : un tour compte quand toutes sont cochées. */
  byRound: boolean;
  rows: { label: Phrase | null; boxes: CheckBox[] }[];
};

const exerciseBox = (exerciseIndex: number): CheckBox => ({
  kind: CheckBoxKind.EXERCISE,
  exerciseIndex,
});

/**
 * Les cases d'un bloc :
 *  - un nombre de tours, au moins deux exercices : une case par exercice et par tour, par tour ;
 *  - un seul exercice : une case par série ; un seul par bip ou par intervalle : une par bip ;
 *  - une seule fois : une case par exercice ;
 *  - autant que possible : une seule case, « Bloc fait ».
 */
export function blockChecks(settings: StructureSettings, exerciseCount: number): BlockChecks {
  const { repeat } = settings;
  if (repeat.kind === StructureRepeat.MAX) {
    return {
      unit: null,
      byRound: false,
      rows: [{ label: null, boxes: [{ kind: CheckBoxKind.BLOCK }] }],
    };
  }
  const exercises = Array.from({ length: exerciseCount }, (_unused, index) => exerciseBox(index));
  if (repeat.kind === StructureRepeat.ONCE) {
    return { unit: CheckUnit.EXERCISE, byRound: false, rows: [{ label: null, boxes: exercises }] };
  }

  const rounds = Array.from({ length: repeat.rounds }, (_unused, index) => index + 1);
  if (oneAtATime(settings, exerciseCount)) {
    const beep = settings.advance.kind === StructureAdvance.BEEP;
    return {
      unit: beep ? CheckUnit.BEEP : CheckUnit.INTERVAL,
      byRound: false,
      rows: rounds.map((index) => ({
        label: beep
          ? { key: "block.checks.beep", params: { index } }
          : { key: "block.checks.interval", params: { index } },
        boxes: [exerciseBox((index - 1) % exerciseCount)],
      })),
    };
  }
  if (exerciseCount === 1) {
    return {
      unit: CheckUnit.SET,
      byRound: false,
      rows: rounds.map((index) => ({
        label: { key: "block.grid.set", params: { index } },
        boxes: [exerciseBox(0)],
      })),
    };
  }
  return {
    unit: CheckUnit.ROUND,
    byRound: true,
    rows: rounds.map((index) => ({
      label: { key: "block.grid.round", params: { index } },
      boxes: exercises,
    })),
  };
}

/** Le nombre de cases du bloc : la borne de son suivi. */
export function blockCheckCount(checks: BlockChecks): number {
  return checks.rows.reduce((sum, row) => sum + row.boxes.length, 0);
}

/** Toutes les cases cochées existent dans ce bloc. Un débrief qui en cite une autre est refusé. */
export function trackingFitsBlock(checks: BlockChecks, tracking: SessionBlockTracking): boolean {
  const count = blockCheckCount(checks);
  return tracking.checked.every((index) => index < count);
}

/** Les cases cochées, rangée par rangée. Une case au-delà du bloc — réglages réduits — est ignorée. */
export function tickedRows(
  checks: BlockChecks,
  tracking: SessionBlockTracking | null,
): boolean[][] {
  const checked = new Set(tracking?.checked);
  let offset = 0;
  return checks.rows.map((row) => {
    const ticked = row.boxes.map((_box, index) => checked.has(offset + index));
    offset += row.boxes.length;
    return ticked;
  });
}

// ── Le décompte ─────────────────────────────────────────────────────────────────────────────

export const BlockTallyState = {
  DONE: "DONE",
  PARTIAL: "PARTIAL",
} as const;
export type BlockTallyState = TypesValuesOf<typeof BlockTallyState>;

export type BlockTally = { state: BlockTallyState; label: Phrase };

/** Le décompte partiel, nommé par son unité : « 3 séries sur 4 ». */
const TALLY_KEY = {
  EXERCISE: "block.tally.exercises",
  BEEP: "block.tally.beeps",
  INTERVAL: "block.tally.intervals",
  SET: "block.tally.sets",
  ROUND: "block.tally.rounds",
} as const satisfies Record<CheckUnit, string>;

/**
 * Trois états : « Terminé » quand tout est coché ; partiel, nommé par son unité (« 1 tour sur
 * 4 ») ; et NON SUIVI, `null`, quand rien n'est coché — sans pastille. Jamais « 0 sur 4 », jamais
 * de rouge : ne rien cocher n'est pas ne rien faire.
 *
 * Rangées par tour, un tour compte quand toutes ses cases sont cochées ; avant le premier, le
 * décompte dit « Tour 1 en cours ».
 */
export function blockTally(
  checks: BlockChecks,
  tracking: SessionBlockTracking | null,
): BlockTally | null {
  const rows = tickedRows(checks, tracking);
  const flat = rows.flat();
  const count = flat.filter(Boolean).length;
  if (count === 0) return null;
  if (count === flat.length) {
    return { state: BlockTallyState.DONE, label: { key: "block.tally.done", params: {} } };
  }

  if (checks.byRound) {
    const full = rows.filter((row) => row.every(Boolean)).length;
    const label: Phrase =
      full === 0
        ? { key: "block.tally.firstRoundInProgress", params: {} }
        : { key: TALLY_KEY.ROUND, params: { count: full, total: rows.length } };
    return { state: BlockTallyState.PARTIAL, label };
  }
  // Une case unique — « Bloc fait » — ne peut pas être à moitié cochée : un partiel a une unité.
  const unit = required(checks.unit, "décompte partiel d'un bloc sans unité");
  return {
    state: BlockTallyState.PARTIAL,
    label: { key: TALLY_KEY[unit], params: { count, total: flat.length } },
  };
}

/** Le texte sous les cases de « Mon suivi ». */
export function trackingNote(checks: BlockChecks): Phrase {
  if (checks.byRound) {
    // Le nombre de cases d'un tour est celui des exercices : toutes les rangées en ont autant.
    const first = required(checks.rows[0], "bloc par tours sans tour");
    return { key: "block.tally.noteRound", params: { count: first.boxes.length } };
  }
  if (checks.unit == null) return { key: "block.tally.noteNoRounds", params: {} };
  return { key: "block.tally.note", params: {} };
}

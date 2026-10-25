import type { StructureSettings } from "../dto/structure.schema";
import { StructureAdvance, StructureOrder, StructureRepeat } from "../dto/structure-answer.schema";
import type { TypesValuesOf } from "../type/generics.type";
import type { Phrase } from "./phrase.util";
import { sameJson } from "./same-json.util";
import { formatTrainingDuration } from "./training-duration.util";

// Les règles des réglages d'une structure (#715), reprises de `structure_model.js` : `rowsOf`,
// `togglesOf`, `orderOf`, `dur` et `phrase`. Elles rendent des clés i18next et leurs paramètres,
// jamais une phrase (règle dure n°6).

type Advance = StructureSettings["advance"];
type Repeat = StructureSettings["repeat"];
type Beep = Extract<Advance, { kind: typeof StructureAdvance.BEEP }>;
type Cycle = Extract<Advance, { kind: typeof StructureAdvance.CYCLE }>;
type Rounds = Extract<Repeat, { kind: typeof StructureRepeat.ROUNDS }>;

// ── Les réglages grisés ─────────────────────────────────────────────────────────────────────

/** Les réponses qui peuvent être grisées par les autres. */
export const SettingOption = {
  REPEAT_MAX: "REPEAT_MAX",
  REPEAT_ONCE: "REPEAT_ONCE",
  REST_BETWEEN_EXERCISES: "REST_BETWEEN_EXERCISES",
  REST_BETWEEN_ROUNDS: "REST_BETWEEN_ROUNDS",
  LIMIT: "LIMIT",
} as const;
export type SettingOption = TypesValuesOf<typeof SettingOption>;

/** Une réponse grisée, et la raison que le panneau affiche à côté. Absente : la réponse est libre. */
export type DisabledOptions = Readonly<Partial<Record<SettingOption, Phrase>>>;

function imposedPace(advance: Advance): advance is Beep | Cycle {
  return advance.kind !== StructureAdvance.ATHLETE;
}

/**
 * Les réponses grisées par les autres :
 *  - avec un bip, ou effort et repos imposés, il faut un nombre de tours : « autant que possible »
 *    et « une seule fois » sont réservés à « quand l'athlète a fini » ;
 *  - un bip, ou un repos imposé, sert déjà de repos : les deux repos sont grisés ;
 *  - le repos entre tours n'a pas de sens sans tours (une seule fois), ni quand le chrono tourne
 *    (autant que possible) ;
 *  - la limite de temps est inutile quand le bloc a déjà une durée : celle de l'AMRAP, ou celle qui
 *    se déduit d'un nombre de bips ou d'intervalles.
 */
export function disabledOptions(settings: StructureSettings): DisabledOptions {
  const disabled: Partial<Record<SettingOption, Phrase>> = {};
  const { advance, repeat } = settings;

  if (imposedPace(advance)) {
    const needsRounds: Phrase =
      advance.kind === StructureAdvance.BEEP
        ? { key: "block.disabled.roundsWithBeep", params: {} }
        : { key: "block.disabled.roundsWithCycle", params: {} };
    disabled.REPEAT_MAX = needsRounds;
    disabled.REPEAT_ONCE = needsRounds;

    const alreadyRest: Phrase =
      advance.kind === StructureAdvance.BEEP
        ? { key: "block.disabled.beepIsRest", params: {} }
        : { key: "block.disabled.includedInCycle", params: {} };
    disabled.REST_BETWEEN_EXERCISES = alreadyRest;
    disabled.REST_BETWEEN_ROUNDS = alreadyRest;
  } else if (repeat.kind === StructureRepeat.ONCE) {
    disabled.REST_BETWEEN_ROUNDS = { key: "block.disabled.singlePass", params: {} };
  } else if (repeat.kind === StructureRepeat.MAX) {
    disabled.REST_BETWEEN_ROUNDS = { key: "block.disabled.clockRuns", params: {} };
  }

  const limit = limitReason(settings);
  if (limit != null) disabled.LIMIT = limit;
  return disabled;
}

function limitReason(settings: StructureSettings): Phrase | null {
  if (settings.repeat.kind === StructureRepeat.MAX) {
    return {
      key: "block.disabled.capAlready",
      params: { cap: formatTrainingDuration(settings.repeat.capSeconds) },
    };
  }
  const duration = structureDuration(settings);
  if (duration == null) return null;
  return {
    key: "block.disabled.durationDerived",
    params: {
      count: duration.rounds,
      unit: formatTrainingDuration(duration.unitSeconds),
      total: formatTrainingDuration(duration.totalSeconds),
    },
  };
}

/** Les réponses grisables que les réglages choisissent. */
function optionValues(settings: StructureSettings): Record<SettingOption, boolean> {
  return {
    REPEAT_MAX: settings.repeat.kind === StructureRepeat.MAX,
    REPEAT_ONCE: settings.repeat.kind === StructureRepeat.ONCE,
    REST_BETWEEN_EXERCISES: settings.restBetweenExercisesSeconds != null,
    REST_BETWEEN_ROUNDS: settings.restBetweenRoundsSeconds != null,
    LIMIT: settings.limitSeconds != null,
  };
}

const OPTION_PATH = {
  REPEAT_MAX: "repeat",
  REPEAT_ONCE: "repeat",
  REST_BETWEEN_EXERCISES: "restBetweenExercisesSeconds",
  REST_BETWEEN_ROUNDS: "restBetweenRoundsSeconds",
  LIMIT: "limitSeconds",
} as const satisfies Record<SettingOption, keyof StructureSettings>;

export type SettingsIssue = { path: keyof StructureSettings; message: string };

/**
 * Les réponses grisées qui portent quand même une valeur, et l'ordre « un seul par… » posé sur
 * « quand l'athlète a fini », où il n'existe pas. Sert au schéma : ce que le panneau grise, l'API
 * le refuse.
 */
export function settingsIssues(settings: StructureSettings): SettingsIssue[] {
  const disabled = disabledOptions(settings);
  const chosen = optionValues(settings);
  const issues: SettingsIssue[] = Object.values(SettingOption)
    .filter((option) => chosen[option] && disabled[option] != null)
    .map((option) => ({
      path: OPTION_PATH[option],
      message: "Ce réglage est grisé par les autres réponses : il ne peut pas être choisi.",
    }));
  if (settings.order === StructureOrder.ONE && !imposedPace(settings.advance)) {
    issues.push({
      path: "order",
      message: "« Un seul par… » demande un bip, ou un effort et un repos imposés.",
    });
  }
  return issues;
}

// ── L'ordre des exercices ───────────────────────────────────────────────────────────────────

/** « Ordre des exercices » n'apparaît qu'à partir de deux exercices, avec un bip ou un cycle. */
export function exerciseOrderShown(settings: StructureSettings, exerciseCount: number): boolean {
  return exerciseCount > 1 && imposedPace(settings.advance);
}

/** Un exercice par bip ou par intervalle, en alternance : le bloc ne se lit plus en tours. */
export function oneAtATime(settings: StructureSettings, exerciseCount: number): boolean {
  return settings.order === StructureOrder.ONE && exerciseOrderShown(settings, exerciseCount);
}

/**
 * « Un seul par bip » exige au moins autant de bips que d'exercices : sinon le dernier exercice
 * ne passerait jamais. `null` quand le nombre suffit.
 */
export function roundsError(settings: StructureSettings, exerciseCount: number): Phrase | null {
  const { repeat } = settings;
  if (!oneAtATime(settings, exerciseCount) || repeat.kind !== StructureRepeat.ROUNDS) return null;
  if (repeat.rounds >= exerciseCount) return null;
  return settings.advance.kind === StructureAdvance.BEEP
    ? { key: "block.settings.tooFewBeeps", params: { count: exerciseCount } }
    : { key: "block.settings.tooFewIntervals", params: { count: exerciseCount } };
}

/**
 * Le plus de lignes que la grille d'un exercice puisse avoir : une par tour, par série, ou par
 * passage de l'exercice avec un seul par bip ; une seule quand le bloc se fait une fois ou autant
 * que possible. Moins de lignes est permis : la dernière vaut pour les suivantes.
 */
export function gridRowLimit(settings: StructureSettings, exerciseCount: number): number {
  const { repeat } = settings;
  if (repeat.kind !== StructureRepeat.ROUNDS) return 1;
  if (oneAtATime(settings, exerciseCount)) return Math.ceil(repeat.rounds / exerciseCount);
  return repeat.rounds;
}

// ── La durée déduite ────────────────────────────────────────────────────────────────────────

export type StructureDuration = { totalSeconds: number; rounds: number; unitSeconds: number };

/**
 * La durée d'un bloc qui se calcule seule : un nombre de bips, ou d'intervalles, fois leur durée.
 * `null` partout ailleurs — quand l'athlète va à son rythme, personne ne connaît la durée, et
 * l'inventer serait une consigne de plus (règle dure n°5).
 */
export function structureDuration(settings: StructureSettings): StructureDuration | null {
  const { advance, repeat } = settings;
  if (repeat.kind !== StructureRepeat.ROUNDS || !imposedPace(advance)) return null;
  const unitSeconds = paceSeconds(advance);
  return { totalSeconds: repeat.rounds * unitSeconds, rounds: repeat.rounds, unitSeconds };
}

function paceSeconds(advance: Beep | Cycle): number {
  return advance.kind === StructureAdvance.BEEP
    ? advance.everySeconds
    : advance.workSeconds + advance.restSeconds;
}

// ── Réglage ou valeur ───────────────────────────────────────────────────────────────────────

/**
 * Les RÉGLAGES d'un bloc : les réponses, sans leurs nombres. Changer l'un d'eux rend le bloc
 * « Personnalisé » et, au niveau planifié, il est verrouillé.
 */
export function settingsShape(settings: StructureSettings) {
  return {
    advance: settings.advance.kind,
    repeat: settings.repeat.kind,
    order: settings.order,
    restBetweenExercises: settings.restBetweenExercisesSeconds != null,
    restBetweenRounds: settings.restBetweenRoundsSeconds != null,
    limit: settings.limitSeconds != null,
  };
}

/**
 * « Personnalisé d'après Séries » : les réglages du bloc ne sont plus ceux qu'il a copiés de sa
 * structure. Changer une VALEUR — 5 tours au lieu de 4, 3' de repos au lieu de 2' — ne le rend pas
 * personnalisé : c'est le travail ordinaire d'une séance.
 */
export function isCustomized(settings: StructureSettings, copied: StructureSettings): boolean {
  return !sameJson(settingsShape(settings), settingsShape(copied));
}

/** Les VALEURS d'un bloc : ce que Dosage ajuste par Athlete, réglages verrouillés. */
export const SettingValue = {
  EVERY: "EVERY",
  WORK: "WORK",
  REST: "REST",
  ROUNDS: "ROUNDS",
  CAP: "CAP",
  REST_BETWEEN_EXERCISES: "REST_BETWEEN_EXERCISES",
  REST_BETWEEN_ROUNDS: "REST_BETWEEN_ROUNDS",
  LIMIT: "LIMIT",
} as const;
export type SettingValue = TypesValuesOf<typeof SettingValue>;

/** Chaque valeur, ou `null` quand la réponse choisie n'en porte pas. */
export function settingValues(settings: StructureSettings): Record<SettingValue, number | null> {
  const { advance, repeat } = settings;
  return {
    EVERY: advance.kind === StructureAdvance.BEEP ? advance.everySeconds : null,
    WORK: advance.kind === StructureAdvance.CYCLE ? advance.workSeconds : null,
    REST: advance.kind === StructureAdvance.CYCLE ? advance.restSeconds : null,
    ROUNDS: repeat.kind === StructureRepeat.ROUNDS ? repeat.rounds : null,
    CAP: repeat.kind === StructureRepeat.MAX ? repeat.capSeconds : null,
    REST_BETWEEN_EXERCISES: settings.restBetweenExercisesSeconds,
    REST_BETWEEN_ROUNDS: settings.restBetweenRoundsSeconds,
    LIMIT: settings.limitSeconds,
  };
}

// ── La phrase ───────────────────────────────────────────────────────────────────────────────

const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;

/** « chaque minute » pour exactement une minute, sinon « toutes les 4' ». */
export function everyPhrase(seconds: number): Phrase {
  if (seconds === SECOND) return { key: "block.every.second", params: {} };
  if (seconds === MINUTE) return { key: "block.every.minute", params: {} };
  if (seconds === HOUR) return { key: "block.every.hour", params: {} };
  return { key: "block.every.interval", params: { duration: formatTrainingDuration(seconds) } };
}

/** « 4 séries » avec un exercice, « 4 tours » à partir de deux — ou sans exercice (structure seule). */
function roundsPhrase(count: number, exerciseCount: number | null): Phrase {
  return exerciseCount === 1
    ? { key: "block.count.sets", params: { count } }
    : { key: "block.count.rounds", params: { count } };
}

/**
 * Ce que dit un bloc, en morceaux à mettre bout à bout (`translatePhrases`) : « 4 séries à son
 * rythme, 2' de repos entre séries ».
 *
 * `exerciseCount` vaut `null` pour une structure seule, dans la bibliothèque : on y dit « tours ».
 * `names` sont les noms des exercices, que « un seul par bip » cite en alternance.
 *
 * `null` quand « un seul par bip » a moins de bips que d'exercices : aucune phrase ne serait vraie
 * (`roundsError` dit pourquoi).
 */
export function settingsPhrase(
  settings: StructureSettings,
  exerciseCount: number | null,
  names: readonly string[] = [],
): Phrase[] | null {
  const { advance, repeat } = settings;
  // Seul `oneAtATime` décide ; le reste, déjà vrai par lui sur des réglages valides, est redit pour
  // que le type le sache.
  if (
    // Stryker disable next-line ConditionalExpression: sans nombre d'exercices, `oneAtATime` est faux
    exerciseCount != null &&
    oneAtATime(settings, exerciseCount) &&
    // Stryker disable next-line ConditionalExpression: un bip ou un cycle impose des tours (`settingsIssues`)
    repeat.kind === StructureRepeat.ROUNDS &&
    // Stryker disable next-line ConditionalExpression: déjà vrai par `oneAtATime`
    imposedPace(advance)
  ) {
    return oneByOnePhrase(advance, repeat, exerciseCount, names);
  }

  const parts = [leadPhrase(settings, exerciseCount), ...detailPhrases(settings, exerciseCount)];
  return parts.flatMap((part, index) =>
    index === 0 ? [part] : [{ key: "block.phrase.separator", params: {} }, part],
  );
}

function leadPhrase(settings: StructureSettings, exerciseCount: number | null): Phrase {
  const { advance, repeat } = settings;
  const pace: Phrase =
    settings.limitSeconds == null
      ? { key: "block.pace.ownPace", params: {} }
      : { key: "block.pace.fastest", params: {} };

  if (repeat.kind === StructureRepeat.ONCE) {
    return exerciseCount === 1
      ? { key: "block.phrase.once", params: { pace } }
      : { key: "block.phrase.onceEach", params: { pace } };
  }
  if (repeat.kind === StructureRepeat.MAX) {
    return {
      key: "block.phrase.max",
      params: { cap: formatTrainingDuration(repeat.capSeconds) },
    };
  }

  const rounds = roundsPhrase(repeat.rounds, exerciseCount);
  if (advance.kind === StructureAdvance.BEEP) {
    return {
      key: "block.phrase.roundsBeep",
      params: { rounds, every: everyPhrase(advance.everySeconds) },
    };
  }
  if (advance.kind === StructureAdvance.CYCLE) {
    return {
      key: "block.phrase.roundsCycle",
      params: {
        rounds,
        work: formatTrainingDuration(advance.workSeconds),
        rest: formatTrainingDuration(advance.restSeconds),
      },
    };
  }
  return { key: "block.phrase.rounds", params: { rounds, pace } };
}

/**
 * Les repos et la limite, chacun s'il est posé et pas grisé. Le repos entre exercices se tait avec
 * un seul exercice : il n'y a rien entre quoi se reposer.
 */
function detailPhrases(settings: StructureSettings, exerciseCount: number | null): Phrase[] {
  const disabled = disabledOptions(settings);
  const details: Phrase[] = [];
  const betweenExercises = settings.restBetweenExercisesSeconds;
  if (betweenExercises != null && disabled.REST_BETWEEN_EXERCISES == null && exerciseCount !== 1) {
    details.push({
      key: "block.phrase.restBetweenExercises",
      params: { rest: formatTrainingDuration(betweenExercises) },
    });
  }
  const betweenRounds = settings.restBetweenRoundsSeconds;
  if (betweenRounds != null && disabled.REST_BETWEEN_ROUNDS == null) {
    const rest = formatTrainingDuration(betweenRounds);
    details.push(
      exerciseCount === 1
        ? { key: "block.phrase.restBetweenSets", params: { rest } }
        : { key: "block.phrase.restBetweenRounds", params: { rest } },
    );
  }
  if (settings.limitSeconds != null && disabled.LIMIT == null) {
    details.push({
      key: "block.phrase.limit",
      params: { limit: formatTrainingDuration(settings.limitSeconds) },
    });
  }
  return details;
}

/**
 * « 10 bips, chaque minute : KB swing et Burpees en alternance, 5 fois chacun ». Quand le nombre
 * ne tombe pas juste, les premiers passent une fois de plus : « 4 fois pour le premier, 3 pour les
 * autres ».
 */
function oneByOnePhrase(
  advance: Beep | Cycle,
  repeat: Rounds,
  exerciseCount: number,
  names: readonly string[],
): Phrase[] | null {
  const { rounds } = repeat;
  if (rounds < exerciseCount) return null;

  const what: Phrase =
    advance.kind === StructureAdvance.BEEP
      ? {
          key: "block.phrase.beepsEvery",
          params: {
            beeps: { key: "block.count.beeps", params: { count: rounds } },
            every: everyPhrase(advance.everySeconds),
          },
        }
      : {
          key: "block.phrase.intervalsCycle",
          params: {
            intervals: { key: "block.count.intervals", params: { count: rounds } },
            work: formatTrainingDuration(advance.workSeconds),
            rest: formatTrainingDuration(advance.restSeconds),
          },
        };
  const who: Phrase =
    names.length > 0
      ? { key: "block.phrase.alternating", params: { names } }
      : { key: "block.phrase.eachInTurn", params: {} };

  return [
    {
      key: "block.phrase.oneByOne",
      params: { what, who, times: timesPhrase(rounds, exerciseCount) },
    },
  ];
}

function timesPhrase(rounds: number, exerciseCount: number): Phrase {
  const each = Math.floor(rounds / exerciseCount);
  const extra = rounds % exerciseCount;
  if (extra === 0) return { key: "block.phrase.timesEach", params: { count: each } };

  const others = exerciseCount - extra;
  const first: Phrase = {
    key: "block.phrase.timesFirst",
    params: { count: extra, times: each + 1 },
  };
  let rest: Phrase;
  if (others > 1) rest = { key: "block.phrase.timesOthers", params: { times: each } };
  else if (extra === 1) rest = { key: "block.phrase.timesOther", params: { times: each } };
  else rest = { key: "block.phrase.timesLast", params: { times: each } };
  return { key: "block.phrase.timesUneven", params: { first, rest } };
}

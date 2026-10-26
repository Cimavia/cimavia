import { STRUCTURE_NAME_MAX_LENGTH, type StructureSettings } from "../dto/structure.schema";
import { StructureAdvance, StructureOrder, StructureRepeat } from "../dto/structure-answer.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { disabledOptions, SettingValue, structureDuration } from "./structure-settings.util";

// Le formulaire d'une structure (#717) : ce que devient le brouillon quand le Coach change une
// réponse, le Déroulé qu'il lit à côté, et le nom qu'il doit choisir unique. Repris de
// `structure_model.js` : `D`, `rowsOf`, `togglesOf`, `segsOf` et `form`.

/** Les valeurs qu'une réponse prend quand le Coach la choisit : la maquette les pose (`D`). */
export const STRUCTURE_DEFAULTS = {
  everySeconds: 60,
  workSeconds: 20,
  restSeconds: 10,
  rounds: 4,
  capSeconds: 12 * 60,
  restBetweenExercisesSeconds: 30,
  restBetweenRoundsSeconds: 2 * 60,
  limitSeconds: 15 * 60,
} as const;

/** Les réglages d'une structure neuve : des Séries, la première des structures prêtes. */
export const NEW_STRUCTURE_SETTINGS: StructureSettings = {
  advance: { kind: StructureAdvance.ATHLETE },
  repeat: { kind: StructureRepeat.ROUNDS, rounds: STRUCTURE_DEFAULTS.rounds },
  restBetweenExercisesSeconds: null,
  restBetweenRoundsSeconds: STRUCTURE_DEFAULTS.restBetweenRoundsSeconds,
  limitSeconds: null,
  order: StructureOrder.ALL,
};

// ── Changer une réponse ─────────────────────────────────────────────────────────────────────

/**
 * Les réglages, sans ce que leurs réponses grisent. Une réponse grisée ne porte jamais de valeur
 * (`settingsIssues`) : sans ce ménage, choisir un bip laisserait le repos entre tours posé, et
 * l'enregistrement serait refusé pour un réglage que le Coach ne voit plus.
 *
 * La question 2 d'abord : passer d'« autant que possible » à un nombre de tours change ce que la
 * limite peut être (sa durée se déduit alors d'un bip).
 */
export function withoutDisabled(settings: StructureSettings): StructureSettings {
  const first = disabledOptions(settings);
  const repeatDisabled =
    (settings.repeat.kind === StructureRepeat.MAX && first.REPEAT_MAX != null) ||
    (settings.repeat.kind === StructureRepeat.ONCE && first.REPEAT_ONCE != null);
  const repeated: StructureSettings = repeatDisabled
    ? { ...settings, repeat: { kind: StructureRepeat.ROUNDS, rounds: STRUCTURE_DEFAULTS.rounds } }
    : settings;

  const disabled = disabledOptions(repeated);
  return {
    ...repeated,
    restBetweenExercisesSeconds:
      disabled.REST_BETWEEN_EXERCISES == null ? repeated.restBetweenExercisesSeconds : null,
    restBetweenRoundsSeconds:
      disabled.REST_BETWEEN_ROUNDS == null ? repeated.restBetweenRoundsSeconds : null,
    limitSeconds: disabled.LIMIT == null ? repeated.limitSeconds : null,
    // « Un seul par… » n'existe qu'avec un bip ou un cycle.
    order: repeated.advance.kind === StructureAdvance.ATHLETE ? StructureOrder.ALL : repeated.order,
  };
}

/** Question 1 : la réponse choisie prend ses durées par défaut ; la même réponse ne change rien. */
export function withAdvance(
  settings: StructureSettings,
  kind: StructureAdvance,
): StructureSettings {
  if (settings.advance.kind === kind) return settings;
  return withoutDisabled({ ...settings, advance: advanceOf(kind) });
}

function advanceOf(kind: StructureAdvance): StructureSettings["advance"] {
  if (kind === StructureAdvance.BEEP) {
    return { kind, everySeconds: STRUCTURE_DEFAULTS.everySeconds };
  }
  if (kind === StructureAdvance.CYCLE) {
    return {
      kind,
      workSeconds: STRUCTURE_DEFAULTS.workSeconds,
      restSeconds: STRUCTURE_DEFAULTS.restSeconds,
    };
  }
  return { kind };
}

/** Question 2, comme la question 1. Une réponse grisée par la première ne se choisit pas. */
export function withRepeat(settings: StructureSettings, kind: StructureRepeat): StructureSettings {
  if (settings.repeat.kind === kind) return settings;
  return withoutDisabled({ ...settings, repeat: repeatOf(kind) });
}

function repeatOf(kind: StructureRepeat): StructureSettings["repeat"] {
  if (kind === StructureRepeat.ROUNDS) return { kind, rounds: STRUCTURE_DEFAULTS.rounds };
  if (kind === StructureRepeat.MAX) return { kind, capSeconds: STRUCTURE_DEFAULTS.capSeconds };
  return { kind };
}

/** Les trois réglages de la question 3, qui se cochent. */
export const StructureToggle = {
  REST_BETWEEN_EXERCISES: "REST_BETWEEN_EXERCISES",
  REST_BETWEEN_ROUNDS: "REST_BETWEEN_ROUNDS",
  LIMIT: "LIMIT",
} as const;
export type StructureToggle = TypesValuesOf<typeof StructureToggle>;

const TOGGLE_FIELD = {
  REST_BETWEEN_EXERCISES: "restBetweenExercisesSeconds",
  REST_BETWEEN_ROUNDS: "restBetweenRoundsSeconds",
  LIMIT: "limitSeconds",
} as const satisfies Record<StructureToggle, keyof StructureSettings>;

/** Coché, le réglage prend sa durée par défaut ; décoché, il se vide. Grisé, il reste vide. */
export function withToggle(
  settings: StructureSettings,
  toggle: StructureToggle,
  on: boolean,
): StructureSettings {
  const field = TOGGLE_FIELD[toggle];
  if ((settings[field] != null) === on) return settings;
  return withoutDisabled({ ...settings, [field]: on ? STRUCTURE_DEFAULTS[field] : null });
}

/**
 * Une valeur — durée en secondes, ou nombre de tours. Ignorée quand la réponse choisie ne la porte
 * pas : le champ n'existe alors pas à l'écran.
 */
export function withSettingValue(
  settings: StructureSettings,
  value: SettingValue,
  amount: number,
): StructureSettings {
  const { advance, repeat } = settings;
  switch (value) {
    case SettingValue.EVERY:
      return advance.kind === StructureAdvance.BEEP
        ? { ...settings, advance: { ...advance, everySeconds: amount } }
        : settings;
    case SettingValue.WORK:
      return advance.kind === StructureAdvance.CYCLE
        ? { ...settings, advance: { ...advance, workSeconds: amount } }
        : settings;
    case SettingValue.REST:
      return advance.kind === StructureAdvance.CYCLE
        ? { ...settings, advance: { ...advance, restSeconds: amount } }
        : settings;
    case SettingValue.ROUNDS:
      return repeat.kind === StructureRepeat.ROUNDS
        ? { ...settings, repeat: { ...repeat, rounds: amount } }
        : settings;
    case SettingValue.CAP:
      return repeat.kind === StructureRepeat.MAX
        ? { ...settings, repeat: { ...repeat, capSeconds: amount } }
        : settings;
    case SettingValue.REST_BETWEEN_EXERCISES:
      return withPosed(settings, "restBetweenExercisesSeconds", amount);
    case SettingValue.REST_BETWEEN_ROUNDS:
      return withPosed(settings, "restBetweenRoundsSeconds", amount);
    case SettingValue.LIMIT:
      return withPosed(settings, "limitSeconds", amount);
  }
}

/** Un repos ou la limite ne change de valeur que s'il est coché : décoché, il n'a pas de champ. */
function withPosed(
  settings: StructureSettings,
  field: (typeof TOGGLE_FIELD)[StructureToggle],
  amount: number,
): StructureSettings {
  return settings[field] == null ? settings : { ...settings, [field]: amount };
}

// ── Le Déroulé ──────────────────────────────────────────────────────────────────────────────

/** Au-delà, la frise serait illisible : elle montre les premiers tours (`segsOf`). */
export const TIMELINE_MAX_ROUNDS = 24;
/** « Autant que possible » n'a pas de nombre de tours : la frise en montre quelques-uns, muets. */
const TIMELINE_OPEN_ROUNDS = 6;

/** Un segment de la frise : un tour, numéroté quand on sait le compter, ou un repos. */
export type TimelineSegment = { kind: "work"; round: number | null } | { kind: "rest" };

/**
 * Ce que dit la légende, en données : l'app la traduit. Un bip, un cycle effort-repos, ou des tours
 * à son rythme — pendant `capSeconds` pour un « autant que possible » —, avec leur repos s'il y en a.
 */
export type TimelineLegend =
  | { kind: "beep"; everySeconds: number }
  | { kind: "cycle"; workSeconds: number; restSeconds: number }
  | { kind: "ownPace"; capSeconds: number | null; restSeconds: number | null };

export type StructureTimeline = {
  segments: TimelineSegment[];
  legend: TimelineLegend;
  /** Début, milieu et fin, en secondes, quand la durée se déduit ; sinon `null` (règle dure n°5). */
  axisSeconds: readonly [number, number, number] | null;
};

/** La frise « Déroulé » du formulaire : un segment par tour, et un repos entre eux s'il y en a. */
export function structureTimeline(settings: StructureSettings): StructureTimeline {
  const { advance, repeat } = settings;
  const count = timelineRounds(repeat);
  const cycles = advance.kind === StructureAdvance.CYCLE;
  const segments: TimelineSegment[] = [];
  for (let round = 1; round <= count; round++) {
    segments.push({ kind: "work", round: repeat.kind === StructureRepeat.MAX ? null : round });
    // Le cycle se repose après chaque effort, le dernier compris ; le repos entre tours, entre deux.
    if (cycles || (settings.restBetweenRoundsSeconds != null && round < count)) {
      segments.push({ kind: "rest" });
    }
  }

  // L'axe gradue ce que la frise dessine : au-delà de 24 tours, les premiers, pas le bloc entier
  // — sa durée totale se lit à côté.
  const duration = structureDuration(settings);
  const drawnSeconds = duration == null ? null : count * duration.unitSeconds;
  return {
    segments,
    legend: legendOf(settings),
    axisSeconds: drawnSeconds == null ? null : [0, Math.round(drawnSeconds / 2), drawnSeconds],
  };
}

function timelineRounds(repeat: StructureSettings["repeat"]): number {
  if (repeat.kind === StructureRepeat.ROUNDS) return Math.min(repeat.rounds, TIMELINE_MAX_ROUNDS);
  return repeat.kind === StructureRepeat.MAX ? TIMELINE_OPEN_ROUNDS : 1;
}

function legendOf(settings: StructureSettings): TimelineLegend {
  const { advance, repeat } = settings;
  if (advance.kind === StructureAdvance.BEEP) {
    return { kind: "beep", everySeconds: advance.everySeconds };
  }
  if (advance.kind === StructureAdvance.CYCLE) {
    return { kind: "cycle", workSeconds: advance.workSeconds, restSeconds: advance.restSeconds };
  }
  return {
    kind: "ownPace",
    capSeconds: repeat.kind === StructureRepeat.MAX ? repeat.capSeconds : null,
    restSeconds: settings.restBetweenRoundsSeconds,
  };
}

// ── Le nom ──────────────────────────────────────────────────────────────────────────────────

/**
 * Deux noms désignent la même structure, sans tenir compte des majuscules ni des espaces de bord
 * (maquette, frame 6). Les accents comptent : « Départ » et « Depart » sont deux structures. Le
 * formulaire et l'API appliquent cette même règle — d'où une casse sans locale, qui ferait
 * différer un navigateur turc de Node, et un « é » normalisé, qu'il soit saisi en un ou deux
 * caractères.
 */
export function sameStructureName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

function nameKey(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

/**
 * Le nom de l'AUTRE structure du Coach qui porte déjà ce nom, tel qu'elle l'écrit — le formulaire
 * le cite —, ou `null` quand il est libre. Un nom vide n'est pris par personne : c'est un autre
 * refus.
 *
 * Celle qu'on modifie garde toujours le sien, même si une autre le porte aussi : un doublon d'avant
 * la règle (#716) ne doit pas forcer à renommer pour changer une note.
 */
export function takenStructureName(
  name: string,
  structures: readonly { id: string; name: string }[],
  selfId: string | null,
): string | null {
  if (name.trim() === "") return null;
  const self = structures.find((structure) => structure.id === selfId);
  if (self != null && sameStructureName(self.name, name)) return null;
  const owner = structures.find(
    (structure) => structure.id !== selfId && sameStructureName(structure.name, name),
  );
  return owner?.name ?? null;
}

/**
 * Le nom d'une copie : « Tabata (copie) », puis « Tabata (copie 2) » si le premier est pris. La
 * forme vient de l'app, qui la traduit (`format(base, n)`, `n` à partir de 1). La base est rognée
 * quand la copie dépasserait la longueur permise : la copie doit pouvoir s'enregistrer telle quelle.
 */
export function structureCopyName(
  base: string,
  taken: readonly string[],
  format: (base: string, n: number) => string,
): string {
  for (let n = 1; ; n++) {
    const name = fittedName(base.trim(), n, format);
    if (!taken.some((other) => sameStructureName(other, name))) return name;
  }
}

function fittedName(base: string, n: number, format: (base: string, n: number) => string): string {
  const overflow = format(base, n).length - STRUCTURE_NAME_MAX_LENGTH;
  return overflow > 0
    ? // Une forme plus longue que la borne à elle seule ne garde rien de la base.
      format(base.slice(0, Math.max(0, base.length - overflow)).trimEnd(), n)
    : format(base, n);
}

import type { TypesValuesOf } from "../type/generics.type";

// Les réponses aux questions d'une structure (#715), à part de son schéma : les règles des
// réglages (`structure-settings.util`) les lisent, et le schéma lit ces règles. Réunies dans un
// même module, les deux s'importaient l'un l'autre — un cycle qui ne tient que tant qu'aucune
// constante de premier niveau ne lit l'autre côté au chargement.

// ── 1. Quand passe-t-on à la suite ? ────────────────────────────────────────────────────────

export const StructureAdvance = {
  /** Quand l'athlète a fini : pas de chrono, il enchaîne à son rythme. */
  ATHLETE: "ATHLETE",
  /** À chaque bip, à intervalle régulier : le temps restant sert de repos. */
  BEEP: "BEEP",
  /** Effort puis repos imposés, en boucle. */
  CYCLE: "CYCLE",
} as const;
export type StructureAdvance = TypesValuesOf<typeof StructureAdvance>;

// ── 2. Combien de fois ? ────────────────────────────────────────────────────────────────────

export const StructureRepeat = {
  /** Un nombre fixé de tours, puis le bloc est fini. */
  ROUNDS: "ROUNDS",
  /** Autant que possible dans le temps donné. */
  MAX: "MAX",
  /** Une seule fois, chaque exercice du premier au dernier. */
  ONCE: "ONCE",
} as const;
export type StructureRepeat = TypesValuesOf<typeof StructureRepeat>;

// ── 4. L'ordre des exercices ────────────────────────────────────────────────────────────────

export const StructureOrder = {
  /** Tous les exercices s'enchaînent dans le même bip ou le même intervalle. */
  ALL: "ALL",
  /** Un exercice par bip ou par intervalle, en alternance. */
  ONE: "ONE",
} as const;
export type StructureOrder = TypesValuesOf<typeof StructureOrder>;

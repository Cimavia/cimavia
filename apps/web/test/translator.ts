import type { TFunction } from "i18next";

/**
 * Le traducteur des tests : il rend la CLÉ, jamais le français.
 *
 * On affirme donc sur `exercise.dosage.series` et pas sur « 4 séries ». Un test écrit sur le texte
 * rendu casserait au premier ajustement de formulation du catalogue — un échec rouge sans qu'aucune
 * régression n'ait eu lieu, ce qui est la meilleure façon d'apprendre à ignorer une suite.
 *
 * Les paramètres d'interpolation sont concaténés à la clé plutôt qu'ignorés : ils portent les
 * plafonds et les décomptes, c'est-à-dire précisément ce qui se met à mentir en silence quand une
 * constante bouge (cf. `MediaRejectedError`).
 */
export const fakeT = ((key: string, params?: Record<string, unknown>) =>
  params == null ? key : `${key}(${JSON.stringify(params)})`) as unknown as TFunction;

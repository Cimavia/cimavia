import type { BlockTrackingState, ExerciseTracking } from "../dto/exercise-block.schema";

/** Le suivi de TOUTE une séance, indexé par identifiant d'exercice diffusé. */
export type SessionTracking = Record<string, ExerciseTracking | null>;

/**
 * Les transformations du suivi local — pures, et communes aux deux surfaces.
 *
 * Elles vivaient en double dans `useLocalTracking`, web et mobile. Seul le STOCKAGE diffère
 * (`localStorage` d'un côté, `AsyncStorage` de l'autre) ; ce qu'une coche fait au suivi, non. Deux
 * copies auraient fini par diverger sur un cas limite — l'ordre des index, la naissance d'une
 * entrée — et les deux surfaces n'auraient plus décompté pareil.
 */

/** Les index cochés d'un bloc, ou une liste vide — un compteur d'AMRAP n'en a pas. */
function checkedIn(tracking: SessionTracking, exerciseId: string, blockId: string): number[] {
  const state = tracking[exerciseId]?.[blockId];
  return state != null && "checked" in state ? [...state.checked] : [];
}

function withBlock(
  tracking: SessionTracking,
  exerciseId: string,
  blockId: string,
  state: BlockTrackingState,
): SessionTracking {
  return {
    ...tracking,
    [exerciseId]: { ...(tracking[exerciseId] ?? {}), [blockId]: state },
  };
}

/** Bascule une unité. Le premier appel fait NAÎTRE le suivi de cet exercice. */
export function toggleUnit(
  tracking: SessionTracking,
  exerciseId: string,
  blockId: string,
  index: number,
): SessionTracking {
  const checked = checkedIn(tracking, exerciseId, blockId);
  const next = checked.includes(index)
    ? checked.filter((item) => item !== index)
    : [...checked, index].sort((a, b) => a - b);
  return withBlock(tracking, exerciseId, blockId, { checked: next });
}

/**
 * Coche une unité SANS la décocher si elle l'est déjà.
 *
 * C'est ce dont le déroulé automatique a besoin : il coche au fil des segments, et l'effort puis
 * le repos d'une même série passent tous les deux par là. Un `toggle` la décocherait au second
 * appel — l'athlète verrait sa série s'effacer toute seule.
 */
export function checkUnit(
  tracking: SessionTracking,
  exerciseId: string,
  blockId: string,
  index: number,
): SessionTracking {
  const checked = checkedIn(tracking, exerciseId, blockId);
  if (checked.includes(index)) return tracking;
  return withBlock(tracking, exerciseId, blockId, {
    checked: [...checked, index].sort((a, b) => a - b),
  });
}

/** L'AMRAP se COMPTE : son objectif est indicatif, et le compteur n'a pas de plafond. */
export function setRounds(
  tracking: SessionTracking,
  exerciseId: string,
  blockId: string,
  rounds: number,
): SessionTracking {
  return withBlock(tracking, exerciseId, blockId, { rounds: Math.max(0, rounds) });
}

/**
 * Deux suivis disent-ils la même chose ?
 *
 * Comparé sur une forme CANONIQUE (clés triées) : deux objets identiques écrits dans un ordre
 * différent — au fil des coches d'un côté, au chargement de l'autre — ne doivent pas passer pour
 * une modification, sinon « Enregistrer » resterait actif sur un débrief déjà envoyé.
 */
export function sameTracking(a: SessionTracking, b: SessionTracking): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value != null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, item]) => `${k}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

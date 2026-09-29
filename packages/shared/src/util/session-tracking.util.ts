import type { BlockTrackingState, ExerciseTracking } from "../dto/exercise-block.schema";
import type { FeedbackTracking } from "../dto/feedback.schema";
import type { ScheduledSessionDto } from "../dto/plan.schema";

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
 * Le suivi restreint aux exercices que la séance porte ENCORE — ce qui part avec le débrief.
 *
 * Le suivi local survit à la séance qu'il décrit : le coach peut retirer un exercice que l'athlète
 * a déjà coché, et la clé reste sur l'appareil. Le serveur refuse un débrief qui cite un exercice
 * inconnu de la séance (#311) — l'envoyer tel quel bloquerait donc l'athlète à chaque tentative,
 * pour une coche qui ne désigne plus rien.
 *
 * Rend le suivi LUI-MÊME quand rien n'est à retirer : le cas courant n'alloue rien.
 */
export function trackingOfExercises(
  tracking: SessionTracking,
  exercises: readonly { id: string }[],
): SessionTracking {
  const present = new Set(exercises.map((exercise) => exercise.id));
  if (Object.keys(tracking).every((id) => present.has(id))) return tracking;
  return Object.fromEntries(Object.entries(tracking).filter(([id]) => present.has(id)));
}

/**
 * Le suivi local dit-il encore ce qui vient de partir avec le débrief ?
 *
 * POURQUOI (#499). L'envoi prend le temps d'une requête, et les cases restent actives pendant ce
 * temps. Effacer le local à la réponse, sans regarder, perdait sans bruit une coche posée entre
 * l'envoi et la réponse. Vrai seulement si rien n'a bougé : le local a fait son travail, on peut
 * l'effacer. Faux : il porte une correction que le serveur n'a pas, et reste à envoyer.
 *
 * Comparé après le MÊME filtre que l'envoi : une coche restée sur un exercice retiré n'est jamais
 * partie, et ne doit pas retenir le local indéfiniment.
 */
export function isTrackingSent(
  current: SessionTracking,
  sent: SessionTracking,
  exercises: readonly { id: string }[],
): boolean {
  return sameTracking(trackingOfExercises(current, exercises), sent);
}

/**
 * La séance en cache, avec le suivi qui vient de partir — en attendant que sa relecture réponde.
 *
 * POURQUOI (#346, #499). Effacer le local rend les écrans au distant EN CACHE, qui porte encore le
 * décompte d'avant la séance. Une coche posée avant la réponse de la relecture repartait de lui :
 * l'ancien décompte revenait en local, et l'emportait au débrief suivant. Les deux clients
 * écrivent donc l'envoi dans leur cache avant d'effacer le local.
 *
 * Même règle que le serveur : un exercice absent de l'envoi garde son suivi, `null` l'efface.
 */
export function withSentTracking(
  session: ScheduledSessionDto,
  sent: FeedbackTracking,
): ScheduledSessionDto {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id in sent ? { ...exercise, tracking: sent[exercise.id] ?? null } : exercise,
    ),
  };
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

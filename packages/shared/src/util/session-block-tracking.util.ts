import {
  type BlockCheck,
  blockCheckId,
  type SessionBlockTracking,
} from "../dto/block-tracking.schema";
import type { FeedbackBlockTracking, TrackedBlockDto } from "../dto/feedback.schema";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import type { StructureSettings } from "../dto/structure.schema";
import {
  type BlockTally,
  blockCheckIds,
  blockChecks,
  blockTally,
  checksOfBlock,
} from "./block-tracking.util";
import { sameJson } from "./same-json.util";
import { type SessionTracking, trackingOfExercises } from "./session-tracking.util";

// Le suivi local d'une séance composée par blocs (#722), commun aux deux surfaces : le jumeau de
// `session-tracking.util` pour l'ancien modèle. Seul le STOCKAGE distingue le web du mobile ; ce
// qu'une coche fait au suivi vit ici, pour que les deux décomptent pareil.

/** Le suivi de TOUTE une séance, indexé par identifiant de bloc planifié. */
export type BlockSessionTracking = Record<string, SessionBlockTracking | null>;

/** Ce qu'il faut d'un bloc de la séance pour savoir quelles coches le désignent encore. */
type TrackedBlockScope = {
  id: string;
  settings: StructureSettings;
  exercises: readonly { key: string }[];
};

/** Le suivi de chaque bloc, tel que la séance le porte : le point de départ du local. */
export function blockTrackingOf(
  blocks: readonly { id: string; tracking: SessionBlockTracking | null }[],
): BlockSessionTracking {
  return Object.fromEntries(blocks.map((block) => [block.id, block.tracking]));
}

/**
 * Coche ou décoche une case. La première coche fait NAÎTRE le suivi du bloc, la dernière décochée
 * le rend NON SUIVI : rien de coché se décompte pareil, et le local retombe sur le `null` distant
 * au lieu de se croire modifié.
 */
export function toggleBlockCheck(
  tracking: BlockSessionTracking,
  blockId: string,
  check: BlockCheck,
): BlockSessionTracking {
  const checked = tracking[blockId]?.checked ?? [];
  const id = blockCheckId(check);
  const without = checked.filter((item) => blockCheckId(item) !== id);
  const next = without.length === checked.length ? [...checked, check] : without;
  return { ...tracking, [blockId]: next.length === 0 ? null : { checked: next } };
}

/**
 * Le suivi restreint à ce que la séance porte ENCORE — ce qui part avec le débrief.
 *
 * Le suivi local survit aux changements du Coach : il peut retirer un bloc, ou un exercice qu'une
 * case désignait. Le serveur refuse un bloc absent et une case que le bloc n'a plus
 * (`trackingFitsBlock`) : envoyer le local tel quel bloquerait l'athlète à chaque tentative, pour
 * une coche qui ne désigne plus rien.
 *
 * Rend le suivi LUI-MÊME quand rien n'est à retirer : le cas courant n'alloue rien.
 */
export function blockTrackingOfSession(
  tracking: BlockSessionTracking,
  blocks: readonly TrackedBlockScope[],
): BlockSessionTracking {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const kept: [string, SessionBlockTracking | null][] = [];
  for (const [id, state] of Object.entries(tracking)) {
    const block = byId.get(id);
    if (block != null) kept.push([id, state == null ? null : withinBlock(state, block)]);
  }
  const unchanged =
    kept.length === Object.keys(tracking).length &&
    kept.every(([id, state]) => state === tracking[id]);
  return unchanged ? tracking : Object.fromEntries(kept);
}

/** Le suivi d'un bloc sans les cases qu'il n'a plus — lui-même s'il n'en cite aucune. */
function withinBlock(state: SessionBlockTracking, block: TrackedBlockScope): SessionBlockTracking {
  const boxes = blockCheckIds(checksOfBlock(block));
  if (state.checked.every((check) => boxes.has(blockCheckId(check)))) return state;
  return { checked: state.checked.filter((check) => boxes.has(blockCheckId(check))) };
}

/**
 * Le suivi local dit-il encore ce qui vient de partir avec le débrief ? Même raison que
 * `isTrackingSent` (#499) : une coche posée pendant l'envoi n'est pas au serveur, et effacer le
 * local la perdrait. Comparé après le MÊME filtre que l'envoi.
 */
export function isBlockTrackingSent(
  current: BlockSessionTracking,
  sent: BlockSessionTracking,
  blocks: readonly TrackedBlockScope[],
): boolean {
  return sameJson(blockTrackingOfSession(current, blocks), sent);
}

/**
 * Le suivi local dit-il la même chose que le distant ? Jugé sur ce qui PARTIRAIT (le même filtre
 * que l'envoi) : un bloc ajouté ou retiré par le Coach, ou une case qu'il n'a plus, ne fait pas
 * passer le local pour modifié. Un bloc absent du local n'est pas cité : il garde le distant.
 */
export function sameBlockTracking(
  local: BlockSessionTracking,
  remote: BlockSessionTracking,
  blocks: readonly TrackedBlockScope[],
): boolean {
  const sent = blockTrackingOfSession(local, blocks);
  const kept = blockTrackingOfSession(remote, blocks);
  return Object.entries(sent).every(([id, state]) => sameJson(state, kept[id] ?? null));
}

/**
 * La séance en cache, avec le suivi qui vient de partir — le jumeau de `withSentTracking`. Un bloc
 * absent de l'envoi garde son suivi, `null` l'efface.
 */
export function withSentBlockTracking(
  session: ScheduledSessionDto,
  sent: FeedbackBlockTracking,
): ScheduledSessionDto {
  return {
    ...session,
    blocks: session.blocks.map((block) =>
      block.id in sent ? { ...block, tracking: sent[block.id] ?? null } : block,
    ),
  };
}

/**
 * Le décompte d'un bloc d'après le suivi de TOUTE la séance (local ou distant) — `null` quand rien
 * n'y est coché : ni pastille, ni « 0 sur 4 ».
 */
export function sessionBlockTally(
  block: TrackedBlockScope,
  tracking: BlockSessionTracking,
): BlockTally | null {
  return blockTally(checksOfBlock(block), tracking[block.id] ?? null);
}

/**
 * Le décompte d'un bloc tel que le débrief le rend au Coach (`trackedBlocks`) — `null` quand rien
 * n'est coché : le débrief le dit « pas de décompte », sans « 0 sur 4 ».
 */
export function trackedBlockTally(block: TrackedBlockDto): BlockTally | null {
  return blockTally(blockChecks(block.settings, block.exerciseKeys), block.tracking);
}

/**
 * Le suivi qui part avec le débrief : bloc par bloc pour une séance composée par blocs, exercice
 * par exercice sinon — jamais les deux, une ligne ne se compte qu'une fois (#722). Chacun filtré
 * de ce que le coach a retiré depuis : une coche orpheline ferait refuser tout le débrief (#311).
 */
export function feedbackTrackingInput(
  session: Pick<ScheduledSessionDto, "exercises" | "blocks">,
  exerciseTracking: SessionTracking,
  blockTracking: BlockSessionTracking,
): { tracking: SessionTracking } | { blockTracking: BlockSessionTracking } {
  if (session.blocks.length > 0) {
    return { blockTracking: blockTrackingOfSession(blockTracking, session.blocks) };
  }
  return { tracking: trackingOfExercises(exerciseTracking, session.exercises) };
}

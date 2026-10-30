import {
  type BlockCheck,
  type BlockSessionTracking,
  blockTrackingOf,
  isBlockTrackingSent,
  type ScheduledSessionDto,
  sameBlockTracking,
  toggleBlockCheck,
} from "@cmv/shared";
import { useCallback, useMemo } from "react";
import { useStoredTracking } from "@/feature/plan/hook/useStoredTracking";
import { blockTrackingStore } from "@/feature/plan/lib/local-tracking-store";

const NO_BLOCKS: ScheduledSessionDto["blocks"] = [];

/**
 * Le suivi par bloc (#722), gardé EN LOCAL jusqu'au débrief — le jumeau de `useLocalTracking`, sur
 * le même magasin et pour les mêmes raisons : cocher ne dépend jamais du réseau, tous les écrans
 * d'une séance lisent la même valeur, et le local l'emporte dès qu'il existe.
 *
 * Prend les blocs de la séance (absents tant qu'elle charge) : le distant s'en lit, et le local ne
 * se dit modifié que sur ce qui partirait avec le débrief (`sameBlockTracking`).
 */
export function useLocalBlockTracking(
  sessionId: string,
  blocks: ScheduledSessionDto["blocks"] | undefined,
) {
  const scope = blocks ?? NO_BLOCKS;
  const remote = useMemo(() => blockTrackingOf(scope), [scope]);
  const same = useCallback(
    (local: BlockSessionTracking, distant: BlockSessionTracking) =>
      sameBlockTracking(local, distant, scope),
    [scope],
  );
  const { tracking, dirty, update, clearIf } = useStoredTracking(
    blockTrackingStore,
    sessionId,
    remote,
    same,
  );

  const toggle = useCallback(
    (blockId: string, check: BlockCheck) =>
      update((current) => toggleBlockCheck(current, blockId, check)),
    [update],
  );

  const clearIfSent = useCallback(
    (sent: BlockSessionTracking | undefined) =>
      clearIf(sent, (current, payload) => isBlockTrackingSent(current, payload, scope)),
    [clearIf, scope],
  );

  return { tracking, dirty, toggle, clearIfSent };
}

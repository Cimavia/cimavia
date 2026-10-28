import {
  type BlockCheck,
  type BlockSessionTracking,
  isBlockTrackingSent,
  sameJson,
  toggleBlockCheck,
} from "@cmv/shared";
import { useCallback } from "react";
import { useStoredTracking } from "@/feature/plan/hook/useStoredTracking";

/**
 * Le suivi par bloc (#722), gardé en local jusqu'au débrief — le jumeau de `useLocalTracking`, sous
 * sa propre clé : les deux modèles cohabitent tant qu'une séance sans bloc se lit par exercice.
 */
export function useLocalBlockTracking(sessionId: string, remote: BlockSessionTracking) {
  const { tracking, cached, persist, clearIf } = useStoredTracking(
    `cimavia-block-tracking:${sessionId}`,
    remote,
  );

  const toggle = useCallback(
    (blockId: string, check: BlockCheck) => persist(toggleBlockCheck(tracking, blockId, check)),
    [tracking, persist],
  );

  const clearIfSent = useCallback(
    (sent: BlockSessionTracking | undefined, blocks: Parameters<typeof isBlockTrackingSent>[2]) => {
      if (sent != null) clearIf((current) => isBlockTrackingSent(current, sent, blocks));
    },
    [clearIf],
  );

  /** Faux tant qu'il n'y a rien en local : `tracking` EST alors le distant. */
  const dirty = cached != null && !sameJson(cached, remote);

  return { tracking, dirty, toggle, clearIfSent };
}

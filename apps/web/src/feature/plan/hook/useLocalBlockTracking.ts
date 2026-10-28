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

const NO_BLOCKS: ScheduledSessionDto["blocks"] = [];

/**
 * Le suivi par bloc (#722), gardé en local jusqu'au débrief — le jumeau de `useLocalTracking`, sous
 * sa propre clé : les deux modèles cohabitent tant qu'une séance sans bloc se lit par exercice.
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
  const { tracking, dirty, persist, clearIf } = useStoredTracking(
    `cimavia-block-tracking:${sessionId}`,
    remote,
    same,
  );

  const toggle = useCallback(
    (blockId: string, check: BlockCheck) => persist(toggleBlockCheck(tracking, blockId, check)),
    [tracking, persist],
  );

  const clearIfSent = useCallback(
    (sent: BlockSessionTracking | undefined) => {
      if (sent != null) clearIf((current) => isBlockTrackingSent(current, sent, scope));
    },
    [clearIf, scope],
  );

  return { tracking, dirty, toggle, clearIfSent };
}

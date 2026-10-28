import {
  type BlockCheck,
  type BlockSessionTracking,
  isBlockTrackingSent,
  toggleBlockCheck,
} from "@cmv/shared";
import { useCallback } from "react";
import { useStoredTracking } from "@/feature/plan/hook/useStoredTracking";
import { blockTrackingStore } from "@/feature/plan/lib/local-tracking-store";

/**
 * Le suivi par bloc (#722), gardé EN LOCAL jusqu'au débrief — le jumeau de `useLocalTracking`, sur
 * le même magasin et pour les mêmes raisons : cocher ne dépend jamais du réseau, tous les écrans
 * d'une séance lisent la même valeur, et le local l'emporte dès qu'il existe.
 */
export function useLocalBlockTracking(sessionId: string, remote: BlockSessionTracking) {
  const { tracking, dirty, update, clearIf } = useStoredTracking(
    blockTrackingStore,
    sessionId,
    remote,
  );

  const toggle = useCallback(
    (blockId: string, check: BlockCheck) =>
      update((current) => toggleBlockCheck(current, blockId, check)),
    [update],
  );

  const clearIfSent = useCallback(
    (sent: BlockSessionTracking | undefined, blocks: Parameters<typeof isBlockTrackingSent>[2]) =>
      clearIf(sent, (current, payload) => isBlockTrackingSent(current, payload, blocks)),
    [clearIf],
  );

  return { tracking, dirty, toggle, clearIfSent };
}

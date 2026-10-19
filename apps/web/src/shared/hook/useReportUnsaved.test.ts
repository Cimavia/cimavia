import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";
import { useReportUnsaved } from "@/shared/hook/useReportUnsaved";

/** Le dernier enregistrement remonté, ou `null`. */
function lastReported(onUnsavedChange: ReturnType<typeof vi.fn>): SaveBeforeLeaving | null {
  return onUnsavedChange.mock.lastCall?.[0] ?? null;
}

describe("useReportUnsaved", () => {
  it("remonte l'état de la saisie, puis chacun de ses changements", () => {
    const onUnsavedChange = vi.fn();
    const save = vi.fn(async () => true);
    const { rerender } = renderHook(({ dirty }) => useReportUnsaved(dirty, save, onUnsavedChange), {
      initialProps: { dirty: false },
    });
    expect(onUnsavedChange).toHaveBeenLastCalledWith(null);

    rerender({ dirty: true });
    expect(onUnsavedChange).toHaveBeenLastCalledWith(expect.any(Function));

    rerender({ dirty: false });
    expect(onUnsavedChange).toHaveBeenLastCalledWith(null);
  });

  it("se déclare propre en disparaissant, pour ne rien laisser fermé derrière lui", () => {
    const onUnsavedChange = vi.fn();
    const { unmount } = renderHook(() => useReportUnsaved(true, async () => true, onUnsavedChange));
    expect(lastReported(onUnsavedChange)).not.toBeNull();

    unmount();

    expect(onUnsavedChange).toHaveBeenLastCalledWith(null);
  });

  // Neuf à chaque rendu, l'enregistrement remonté ferait re-rendre l'écran, qui ferait re-rendre
  // le formulaire : la remontée ne se répète pas, et appelle pourtant le DERNIER `save`.
  it("remonte une fois un enregistrement stable, qui appelle le dernier reçu", async () => {
    const onUnsavedChange = vi.fn();
    const first = vi.fn(async () => true);
    const last = vi.fn(async () => false);
    const { rerender } = renderHook(({ save }) => useReportUnsaved(true, save, onUnsavedChange), {
      initialProps: { save: first },
    });

    rerender({ save: last });

    expect(onUnsavedChange).toHaveBeenCalledTimes(1);
    await expect(lastReported(onUnsavedChange)?.()).resolves.toBe(false);
    expect(first).not.toHaveBeenCalled();
  });
});

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReportDirty } from "@/shared/hook/useReportDirty";

describe("useReportDirty", () => {
  it("remonte l'état de la saisie, puis chacun de ses changements", () => {
    const onDirtyChange = vi.fn();
    const { rerender } = renderHook(({ dirty }) => useReportDirty(dirty, onDirtyChange), {
      initialProps: { dirty: false },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    rerender({ dirty: true });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    rerender({ dirty: false });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("se déclare propre en disparaissant, pour ne rien laisser fermé derrière lui", () => {
    const onDirtyChange = vi.fn();
    const { unmount } = renderHook(() => useReportDirty(true, onDirtyChange));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    unmount();

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

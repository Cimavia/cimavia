import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSingleFlight } from "@/shared/hook/useSingleFlight";

/** Un envoi que le test laisse en vol, puis termine. */
function pendingRun() {
  let finish: (saved: boolean) => void = () => undefined;
  const run = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  return { run, finish: (saved: boolean) => finish(saved) };
}

describe("useSingleFlight", () => {
  it("rend l'envoi en vol au lieu d'en lancer un second", async () => {
    const { run, finish } = pendingRun();
    const { result } = renderHook(() => useSingleFlight(run));

    const first = result.current();
    const second = result.current();
    finish(true);

    expect(run).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("relance une fois l'envoi précédent terminé", async () => {
    const run = vi.fn(async () => true);
    const { result } = renderHook(() => useSingleFlight(run));

    await result.current();
    await result.current();

    expect(run).toHaveBeenCalledTimes(2);
  });

  // Un envoi qui rejette ne doit pas fermer pour toujours le suivant.
  it("relance après un envoi rejeté", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce(true);
    const { result } = renderHook(() => useSingleFlight(run));

    await expect(result.current()).rejects.toThrow("réseau");
    await expect(result.current()).resolves.toBe(true);
  });
});

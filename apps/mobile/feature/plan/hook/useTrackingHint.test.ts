import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { asyncStorageMock, storedItems } from "../../../test/setup";
import { useTrackingHint } from "./useTrackingHint";

const KEY = "cimavia-tracking-hint-seen";

describe("useTrackingHint", () => {
  it("montre l'indice à qui ne l'a jamais vu", async () => {
    const { result } = renderHook(() => useTrackingHint());
    await waitFor(() => expect(result.current.hint).toBe(true));
  });

  /** Il ne revient JAMAIS : un indice qu'on doit fermer deux fois n'est plus un indice. */
  it("ne le montre plus une fois qu'il a été vu", async () => {
    storedItems.set(KEY, "1");
    const { result } = renderHook(() => useTrackingHint());

    // Laisse la lecture du stockage se résoudre avant de conclure à l'absence d'indice.
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledWith(KEY));
    expect(result.current.hint).toBe(false);
  });

  it("le referme et retient la fermeture sur ce téléphone", async () => {
    const { result } = renderHook(() => useTrackingHint());
    await waitFor(() => expect(result.current.hint).toBe(true));

    act(() => result.current.dismissHint());

    expect(result.current.hint).toBe(false);
    expect(storedItems.get(KEY)).toBe("1");
  });

  /**
   * Stockage illisible : on n'affiche PAS l'indice. Le montrer à tort à chaque ouverture serait
   * pire que ne jamais le montrer — c'est le repli choisi, pas un accident.
   */
  it("reste muet quand le stockage est illisible", async () => {
    asyncStorageMock.getItem.mockRejectedValueOnce(new Error("stockage HS"));
    const { result } = renderHook(() => useTrackingHint());

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());
    expect(result.current.hint).toBe(false);
  });
});

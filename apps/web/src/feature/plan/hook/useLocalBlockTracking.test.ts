import { type BlockSessionTracking, STRUCTURE_PRESETS } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalBlockTracking } from "./useLocalBlockTracking";

const KEY = "cimavia-block-tracking:s-1";
const EMPTY: BlockSessionTracking = { "blk-1": null };
// La séance ne porte qu'un bloc, à un exercice : c'est lui que l'envoi du débrief peut citer.
const BLOCKS = [{ id: "blk-1", settings: STRUCTURE_PRESETS.SERIES, exercises: [{ key: "a1" }] }];
const SQUAT = { key: "a1", row: 0 };

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "null");

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useLocalBlockTracking", () => {
  it("coche sous sa propre clé, sans toucher au suivi par exercice", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));

    act(() => result.current.toggle("blk-1", SQUAT));

    expect(stored()).toEqual({ "blk-1": { checked: [SQUAT] } });
    expect(window.localStorage.getItem("cimavia-tracking:s-1")).toBeNull();
    expect(result.current.dirty).toBe(true);
  });

  it("efface le local parti tel quel, et redevient miroir du serveur", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));
    act(() => result.current.toggle("blk-1", SQUAT));

    act(() => result.current.clearIfSent(result.current.tracking, BLOCKS));

    expect(result.current.tracking).toBe(EMPTY);
    expect(result.current.dirty).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  // Les cases restent actives pendant l'envoi (#499) : ce qui est coché entre-temps reste à envoyer.
  it("garde le local quand il a bougé pendant l'envoi", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));
    act(() => result.current.toggle("blk-1", SQUAT));
    const sent = result.current.tracking;

    act(() => result.current.toggle("blk-1", { key: "a1", row: 1 }));
    act(() => result.current.clearIfSent(sent, BLOCKS));

    expect(result.current.dirty).toBe(true);
    expect(stored()["blk-1"].checked).toHaveLength(2);
  });

  it("sans suivi envoyé, garde le local", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));
    act(() => result.current.toggle("blk-1", SQUAT));

    act(() => result.current.clearIfSent(undefined, BLOCKS));

    expect(stored()).toEqual({ "blk-1": { checked: [SQUAT] } });
  });

  // Quota plein, navigation privée : l'écran reste juste, seul un rechargement perdrait la coche.
  it("coche quand même si le stockage refuse l'écriture, et s'efface sans lever", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));

    act(() => result.current.toggle("blk-1", SQUAT));
    expect(result.current.tracking).toEqual({ "blk-1": { checked: [SQUAT] } });

    act(() => result.current.clearIfSent(result.current.tracking, BLOCKS));
    expect(result.current.tracking).toBe(EMPTY);
  });
});

import { type ScheduledSessionDto, STRUCTURE_PRESETS } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalBlockTracking } from "./useLocalBlockTracking";

const KEY = "cimavia-block-tracking:s-1";
// La séance ne porte qu'un bloc, à un exercice, non suivi : c'est lui que le débrief peut citer.
const block = (id: string) => ({
  id,
  settings: STRUCTURE_PRESETS.SERIES,
  exercises: [{ key: "a1" }],
  tracking: null,
});
const BLOCKS = [block("blk-1")] as unknown as ScheduledSessionDto["blocks"];
const EMPTY = { "blk-1": null };
const SQUAT = { key: "a1", row: 0 };

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "null");

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useLocalBlockTracking", () => {
  it("coche sous sa propre clé, sans toucher au suivi par exercice", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));

    act(() => result.current.toggle("blk-1", SQUAT));

    expect(stored()).toEqual({ "blk-1": { checked: [SQUAT] } });
    expect(window.localStorage.getItem("cimavia-tracking:s-1")).toBeNull();
    expect(result.current.dirty).toBe(true);
  });

  it("efface le local parti tel quel, et redevient miroir du serveur", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));
    act(() => result.current.toggle("blk-1", SQUAT));

    act(() => result.current.clearIfSent(result.current.tracking));

    expect(result.current.tracking).toEqual(EMPTY);
    expect(result.current.dirty).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  // Les cases restent actives pendant l'envoi (#499) : ce qui est coché entre-temps reste à envoyer.
  it("garde le local quand il a bougé pendant l'envoi", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));
    act(() => result.current.toggle("blk-1", SQUAT));
    const sent = result.current.tracking;

    act(() => result.current.toggle("blk-1", { key: "a1", row: 1 }));
    act(() => result.current.clearIfSent(sent));

    expect(result.current.dirty).toBe(true);
    expect(stored()["blk-1"].checked).toHaveLength(2);
  });

  it("revenu à NON SUIVI, ou face à un bloc ajouté par le Coach, n'a rien à envoyer", () => {
    const { result, rerender } = renderHook(({ blocks }) => useLocalBlockTracking("s-1", blocks), {
      initialProps: { blocks: BLOCKS },
    });
    act(() => result.current.toggle("blk-1", SQUAT));
    act(() => result.current.toggle("blk-1", SQUAT));
    expect(stored()).toEqual(EMPTY);
    expect(result.current.dirty).toBe(false);

    rerender({
      blocks: [...BLOCKS, block("blk-2")] as unknown as ScheduledSessionDto["blocks"],
    });
    expect(result.current.dirty).toBe(false);
  });

  it("sans suivi envoyé, garde le local", () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));
    act(() => result.current.toggle("blk-1", SQUAT));

    act(() => result.current.clearIfSent(undefined));

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
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));

    act(() => result.current.toggle("blk-1", SQUAT));
    expect(result.current.tracking).toEqual({ "blk-1": { checked: [SQUAT] } });

    act(() => result.current.clearIfSent(result.current.tracking));
    expect(result.current.tracking).toEqual(EMPTY);
  });
});

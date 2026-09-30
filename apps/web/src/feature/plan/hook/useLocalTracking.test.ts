import type { SessionTracking } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalTracking } from "./useLocalTracking";

const KEY = "cimavia-tracking:s-1";
const EMPTY: SessionTracking = {};
// La séance ne porte qu'un exercice : c'est lui que l'envoi du débrief peut citer.
const EXERCISES = [{ id: "ex-1" }];

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "null") as SessionTracking;

afterEach(() => {
  window.localStorage.clear();
});

describe("useLocalTracking — effacement après l'envoi", () => {
  it("efface le local qui est parti tel quel, et redevient miroir du serveur", () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    act(() => result.current.toggleUnit("ex-1", "b-1", 3));

    act(() => result.current.clearIfSent(result.current.tracking, EXERCISES));

    expect(result.current.tracking).toBe(EMPTY);
    expect(result.current.dirty).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  /**
   * Les cases restent actives pendant l'envoi : une coche posée entre l'envoi et la réponse n'est
   * pas au serveur. L'effacer la perdait sans bruit (#499).
   */
  it("garde le local quand il a bougé pendant l'envoi", () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    act(() => result.current.toggleUnit("ex-1", "b-1", 3));
    const sent = result.current.tracking;

    act(() => result.current.toggleUnit("ex-1", "b-1", 2));
    act(() => result.current.clearIfSent(sent, EXERCISES));

    const pending = { "ex-1": { "b-1": { checked: [2, 3] } } };
    expect(result.current.tracking).toEqual(pending);
    expect(result.current.dirty).toBe(true);
    expect(stored()).toEqual(pending);
  });

  // La séance n'avait pas pu être chargée : aucun décompte n'est parti, il n'y a rien à effacer.
  it("sans suivi envoyé, garde le local", () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    act(() => result.current.toggleUnit("ex-1", "b-1", 3));

    act(() => result.current.clearIfSent(undefined, EXERCISES));

    expect(stored()).toEqual({ "ex-1": { "b-1": { checked: [3] } } });
  });

  it("repart du local relu au chargement pour comparer", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ "ex-1": { "b-1": { checked: [0] } } }));
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));

    act(() => result.current.clearIfSent({ "ex-1": { "b-1": { checked: [0] } } }, EXERCISES));

    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

import type { SessionTracking } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { asyncStorageMock, storedItems } from "../../../test/setup";
import { useLocalTracking } from "./useLocalTracking";

const keyOf = (sessionId: string) => `cimavia-tracking:${sessionId}`;

const EMPTY: SessionTracking = {};
const withUnit = (index: number): SessionTracking => ({
  "ex-1": { "b-1": { checked: [index] } },
});

const read = (sessionId: string) =>
  JSON.parse(storedItems.get(keyOf(sessionId)) ?? "null") as SessionTracking | null;

describe("useLocalTracking — au chargement", () => {
  /**
   * `null` en cache = on SUIT le distant. Figer un instantané du distant au premier render
   * bloquerait une séance déjà débriefée rouverte sur un autre appareil sur « aucune coche ».
   */
  it("suit le distant tant que rien n'est écrit en local", async () => {
    const remote = withUnit(0);
    const { result } = renderHook(() => useLocalTracking("s-1", remote));

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledWith(keyOf("s-1")));
    expect(result.current.tracking).toBe(remote);
    expect(result.current.dirty).toBe(false);
  });

  /**
   * Le LOCAL l'emporte : il est plus récent par construction, puisqu'il ne monte au serveur qu'au
   * débrief. Écraser avec le distant ferait perdre une séance entière de coches à qui rouvre
   * l'app avant d'avoir débriefé.
   */
  it("fait gagner le local sur le distant", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(withUnit(2)));
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));

    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(result.current.tracking).toEqual(withUnit(2));
  });

  // Un cache illisible n'est pas une raison de bloquer la séance en cours.
  it("reste sur le distant quand le cache local est illisible", async () => {
    storedItems.set(keyOf("s-1"), "{ pas du json");
    const remote = withUnit(0);
    const { result } = renderHook(() => useLocalTracking("s-1", remote));

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());
    expect(result.current.tracking).toBe(remote);
  });

  it("ne mélange pas deux séances : une clé par séance", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(withUnit(2)));
    const { result } = renderHook(() => useLocalTracking("s-2", EMPTY));

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledWith(keyOf("s-2")));
    expect(result.current.tracking).toEqual(EMPTY);
  });
});

describe("useLocalTracking — écriture", () => {
  it("bascule une unité et la persiste sous la clé de la séance", async () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggleUnit("ex-1", "b-1", 0));

    expect(result.current.tracking).toEqual(withUnit(0));
    expect(read("s-1")).toEqual(withUnit(0));
  });

  it("rebascule une unité déjà cochée", async () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggleUnit("ex-1", "b-1", 0));
    act(() => result.current.toggleUnit("ex-1", "b-1", 0));

    expect(result.current.tracking).toEqual({ "ex-1": { "b-1": { checked: [] } } });
  });

  /**
   * Le déroulé automatique passe par `checkUnit` à chaque segment — effort PUIS repos d'une même
   * série. Un `toggle` y effacerait la série sous les yeux de l'athlète.
   */
  it("coche sans jamais décocher, et n'écrit pas deux fois la même chose", async () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.checkUnit("ex-1", "b-1", 0));
    const writes = asyncStorageMock.setItem.mock.calls.length;

    act(() => result.current.checkUnit("ex-1", "b-1", 0));

    expect(result.current.tracking).toEqual(withUnit(0));
    // Référence inchangée : une écriture disque de plus n'apporterait rien.
    expect(asyncStorageMock.setItem).toHaveBeenCalledTimes(writes);
  });

  it("persiste le compteur d'un AMRAP", async () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.setRounds("ex-1", "b-1", 7));

    expect(read("s-1")).toEqual({ "ex-1": { "b-1": { rounds: 7 } } });
  });
});

describe("useLocalTracking — dirty et effacement", () => {
  it("reste propre quand le local dit la même chose que le distant", async () => {
    const remote = withUnit(0);
    const { result } = renderHook(() => useLocalTracking("s-1", remote));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    // Coché puis décoché : on revient à l'état distant, l'écran n'a plus rien à envoyer.
    act(() => result.current.toggleUnit("ex-1", "b-1", 1));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.toggleUnit("ex-1", "b-1", 1));

    expect(result.current.dirty).toBe(false);
  });

  /**
   * Une fois le suivi parti avec le débrief, l'écran redevient un miroir du serveur — qui en est
   * désormais le porteur. Garder le local ferait réapparaître d'anciennes coches.
   */
  it("efface le local et redevient miroir du serveur", async () => {
    const remote = withUnit(0);
    const { result } = renderHook(() => useLocalTracking("s-1", remote));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggleUnit("ex-1", "b-1", 3));
    act(() => result.current.clear());

    expect(result.current.tracking).toBe(remote);
    expect(result.current.dirty).toBe(false);
    expect(storedItems.has(keyOf("s-1"))).toBe(false);
  });
});

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

  /**
   * Le rattrapage du déroulé coche plusieurs unités dans le même tic, sans rendu entre deux (#306).
   * Chaque écriture doit partir de la précédente : sinon seule la dernière survit, et 3 × 30 s de
   * gainage passés écran éteint remontent 1/3 au coach.
   */
  it("additionne des écritures faites sans rendu entre elles", async () => {
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => {
      const { checkUnit, toggleUnit, setRounds } = result.current;
      checkUnit("ex-1", "b-1", 0);
      checkUnit("ex-1", "b-1", 0);
      checkUnit("ex-1", "b-1", 1);
      toggleUnit("ex-1", "b-1", 2);
      setRounds("ex-1", "b-2", 4);
    });

    const expected = { "ex-1": { "b-1": { checked: [0, 1, 2] }, "b-2": { rounds: 4 } } };
    expect(result.current.tracking).toEqual(expected);
    expect(read("s-1")).toEqual(expected);
  });

  // Une coche après le chargement s'ajoute à ce que le disque portait, pas au distant qu'il masque.
  it("écrit par-dessus le local relu au chargement", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(withUnit(2)));
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    act(() => result.current.checkUnit("ex-1", "b-1", 0));

    expect(read("s-1")).toEqual({ "ex-1": { "b-1": { checked: [0, 2] } } });
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

/**
 * L'écran de séance reste monté sous le débrief, et les deux lisent le suivi de la même séance
 * (#346). Deux copies divergeaient : le débrief corrigeait, l'écran du dessous gardait l'ancien
 * décompte et le réécrivait à la coche suivante.
 */
describe("useLocalTracking — une seule valeur par séance", () => {
  // Les deux écrans, montés ensemble, sur la même séance.
  async function twoScreens(remote: SessionTracking = EMPTY) {
    const session = renderHook(() => useLocalTracking("s-1", remote));
    const feedback = renderHook(() => useLocalTracking("s-1", remote));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());
    return { session: session.result, feedback: feedback.result };
  }

  it("une coche d'un écran se voit aussitôt dans l'autre", async () => {
    const { session, feedback } = await twoScreens();

    act(() => session.current.toggleUnit("ex-1", "b-1", 0));
    act(() => feedback.current.toggleUnit("ex-1", "b-1", 1));

    const expected = { "ex-1": { "b-1": { checked: [0, 1] } } };
    expect(session.current.tracking).toEqual(expected);
    expect(feedback.current.tracking).toEqual(expected);
  });

  it("l'effacement par le débrief se voit sur l'écran resté dessous", async () => {
    const remote = withUnit(0);
    const { session, feedback } = await twoScreens(remote);
    act(() => session.current.toggleUnit("ex-1", "b-1", 3));

    act(() => feedback.current.clear());

    expect(session.current.tracking).toBe(remote);
    expect(session.current.dirty).toBe(false);
  });

  // Le second écran trouve la valeur en mémoire : relire le disque n'apprendrait rien.
  it("ne lit le disque qu'une fois pour deux écrans", async () => {
    await twoScreens();
    expect(asyncStorageMock.getItem).toHaveBeenCalledTimes(1);
  });

  /**
   * Une coche posée avant que le disque réponde l'a déjà écrasé : la réponse, arrivée après, est
   * plus ancienne qu'elle et ne doit pas la défaire.
   */
  it("garde une coche posée avant la réponse du disque", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(withUnit(2)));
    let answer: (raw: string | null) => void = () => undefined;
    asyncStorageMock.getItem.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (answer = resolve)),
    );
    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggleUnit("ex-1", "b-1", 0));
    await act(async () => answer(JSON.stringify(withUnit(2))));

    expect(result.current.tracking).toEqual(withUnit(0));
    expect(read("s-1")).toEqual(withUnit(0));
  });

  // Plus aucun écran : la mémoire est oubliée, le prochain montage repart du disque.
  it("relit le disque quand la séance est rouverte", async () => {
    const first = renderHook(() => useLocalTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledTimes(1));
    first.unmount();
    storedItems.set(keyOf("s-1"), JSON.stringify(withUnit(2)));

    const { result } = renderHook(() => useLocalTracking("s-1", EMPTY));

    await waitFor(() => expect(result.current.tracking).toEqual(withUnit(2)));
    expect(asyncStorageMock.getItem).toHaveBeenCalledTimes(2);
  });
});

import {
  type BlockSessionTracking,
  type ScheduledSessionDto,
  STRUCTURE_PRESETS,
} from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { asyncStorageMock, storedItems } from "../../../test/setup";
import { useLocalBlockTracking } from "./useLocalBlockTracking";

const keyOf = (sessionId: string) => `cimavia-block-tracking:${sessionId}`;

const EMPTY: BlockSessionTracking = { "blk-1": null };
const ticked = (row: number): BlockSessionTracking => ({
  "blk-1": { checked: [{ row, key: "a1" }] },
});
// La séance ne porte qu'un bloc, à un exercice : c'est lui que l'envoi du débrief peut citer.
const blocksOf = (tracking: BlockSessionTracking["blk-1"] = null, ...more: string[]) =>
  [
    { id: "blk-1", settings: STRUCTURE_PRESETS.SERIES, exercises: [{ key: "a1" }], tracking },
    ...more.map((id) => ({
      id,
      settings: STRUCTURE_PRESETS.SERIES,
      exercises: [{ key: "a1" }],
      tracking: null,
    })),
  ] as unknown as ScheduledSessionDto["blocks"];
const BLOCKS = blocksOf();

const read = (sessionId: string) =>
  JSON.parse(storedItems.get(keyOf(sessionId)) ?? "null") as BlockSessionTracking | null;

describe("useLocalBlockTracking", () => {
  it("suit le distant tant que rien n'est écrit en local", async () => {
    const blocks = blocksOf(ticked(0)["blk-1"]);
    const { result } = renderHook(() => useLocalBlockTracking("s-1", blocks));

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledWith(keyOf("s-1")));
    expect(result.current.tracking).toEqual(ticked(0));
    expect(result.current.dirty).toBe(false);
  });

  it("fait gagner le local, rangé sous sa propre clé", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(ticked(2)));
    storedItems.set("cimavia-tracking:s-1", JSON.stringify({ "ex-1": null }));
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));

    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(result.current.tracking).toEqual(ticked(2));
  });

  it("coche, décoche et persiste sous la clé de la séance", async () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggle("blk-1", { row: 1, key: "a1" }));
    expect(result.current.tracking).toEqual(ticked(1));
    expect(read("s-1")).toEqual(ticked(1));

    act(() => result.current.toggle("blk-1", { row: 1, key: "a1" }));
    expect(result.current.tracking).toEqual(EMPTY);
    // Revenu à NON SUIVI, le local n'a plus rien à envoyer.
    expect(result.current.dirty).toBe(false);
  });

  it("efface le local parti avec le débrief, pas une coche posée pendant l'envoi", async () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", BLOCKS));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggle("blk-1", { row: 0, key: "a1" }));
    act(() => result.current.clearIfSent(ticked(1)));
    expect(read("s-1")).toEqual(ticked(0));

    act(() => result.current.clearIfSent(undefined));
    expect(read("s-1")).toEqual(ticked(0));

    act(() => result.current.clearIfSent(ticked(0)));
    expect(read("s-1")).toBeNull();
    expect(result.current.tracking).toEqual(EMPTY);
  });

  it("ne se dit pas modifié quand le Coach ajoute un bloc", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(ticked(0)));
    const { result } = renderHook(() =>
      useLocalBlockTracking("s-1", blocksOf(ticked(0)["blk-1"], "blk-2")),
    );

    await waitFor(() => expect(result.current.tracking).toEqual(ticked(0)));
    expect(result.current.dirty).toBe(false);
  });
});

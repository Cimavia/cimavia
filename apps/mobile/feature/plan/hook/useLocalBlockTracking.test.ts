import { type BlockSessionTracking, STRUCTURE_PRESETS } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { asyncStorageMock, storedItems } from "../../../test/setup";
import { useLocalBlockTracking } from "./useLocalBlockTracking";

const keyOf = (sessionId: string) => `cimavia-block-tracking:${sessionId}`;

const EMPTY: BlockSessionTracking = { "blk-1": null };
const ticked = (row: number): BlockSessionTracking => ({
  "blk-1": { checked: [{ row, key: "a1" }] },
});
const BLOCKS = [{ id: "blk-1", settings: STRUCTURE_PRESETS.SERIES, exercises: [{ key: "a1" }] }];

const read = (sessionId: string) =>
  JSON.parse(storedItems.get(keyOf(sessionId)) ?? "null") as BlockSessionTracking | null;

describe("useLocalBlockTracking", () => {
  it("suit le distant tant que rien n'est écrit en local", async () => {
    const remote = ticked(0);
    const { result } = renderHook(() => useLocalBlockTracking("s-1", remote));

    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalledWith(keyOf("s-1")));
    expect(result.current.tracking).toBe(remote);
    expect(result.current.dirty).toBe(false);
  });

  it("fait gagner le local, rangé sous sa propre clé", async () => {
    storedItems.set(keyOf("s-1"), JSON.stringify(ticked(2)));
    storedItems.set("cimavia-tracking:s-1", JSON.stringify({ "ex-1": null }));
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));

    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(result.current.tracking).toEqual(ticked(2));
  });

  it("coche, décoche et persiste sous la clé de la séance", async () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggle("blk-1", { row: 1, key: "a1" }));
    expect(result.current.tracking).toEqual(ticked(1));
    expect(read("s-1")).toEqual(ticked(1));

    act(() => result.current.toggle("blk-1", { row: 1, key: "a1" }));
    expect(result.current.tracking).toEqual({ "blk-1": { checked: [] } });
  });

  it("efface le local parti avec le débrief, pas une coche posée pendant l'envoi", async () => {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", EMPTY));
    await waitFor(() => expect(asyncStorageMock.getItem).toHaveBeenCalled());

    act(() => result.current.toggle("blk-1", { row: 0, key: "a1" }));
    act(() => result.current.clearIfSent(ticked(1), BLOCKS));
    expect(read("s-1")).toEqual(ticked(0));

    act(() => result.current.clearIfSent(undefined, BLOCKS));
    expect(read("s-1")).toEqual(ticked(0));

    act(() => result.current.clearIfSent(ticked(0), BLOCKS));
    expect(read("s-1")).toBeNull();
    expect(result.current.tracking).toBe(EMPTY);
  });
});

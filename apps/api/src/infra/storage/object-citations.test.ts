import { describe, expect, it, vi } from "vitest";
import { chunked, citedStorageKeys } from "./object-citations";

function readerWith(copies: string[], originals: string[]) {
  const asRows = (paths: string[]) => paths.map((storagePath) => ({ storagePath }));
  const copyFindMany = vi.fn().mockResolvedValue(asRows(copies));
  const originalFindMany = vi.fn().mockResolvedValue(asRows(originals));
  const db = {
    scheduledSessionExerciseDocument: { findMany: copyFindMany },
    exerciseDocument: { findMany: originalFindMany },
  } as unknown as Parameters<typeof citedStorageKeys>[0];
  return { db, copyFindMany, originalFindMany };
}

describe("chunked", () => {
  it("découpe sans perdre ni répéter", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("ne rend aucun lot pour une liste vide", () => {
    expect(chunked([])).toEqual([]);
  });
});

describe("citedStorageKeys", () => {
  it("réunit les clés citées par une copie ou par un autre document", async () => {
    const { db } = readerWith(["a"], ["b"]);
    await expect(citedStorageKeys(db, ["a", "b", "c"])).resolves.toEqual(new Set(["a", "b"]));
  });

  it("écarte le document qui part, et lui seul", async () => {
    const { db, copyFindMany, originalFindMany } = readerWith([], []);
    await citedStorageKeys(db, ["a"], "doc-1");
    expect(originalFindMany.mock.calls[0]?.[0].where).toMatchObject({ id: { not: "doc-1" } });
    expect(copyFindMany.mock.calls[0]?.[0].where).not.toHaveProperty("id");
  });

  it("n'interroge rien sans clé", async () => {
    const { db, copyFindMany } = readerWith([], []);
    await expect(citedStorageKeys(db, [])).resolves.toEqual(new Set());
    expect(copyFindMany).not.toHaveBeenCalled();
  });

  it("ignore un chemin vide, que le type de la colonne autorise", async () => {
    const copyFindMany = vi.fn().mockResolvedValue([{ storagePath: null }]);
    const originalFindMany = vi.fn().mockResolvedValue([]);
    const db = {
      scheduledSessionExerciseDocument: { findMany: copyFindMany },
      exerciseDocument: { findMany: originalFindMany },
    } as unknown as Parameters<typeof citedStorageKeys>[0];
    await expect(citedStorageKeys(db, ["a"])).resolves.toEqual(new Set());
  });
});

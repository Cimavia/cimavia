import { DocumentType } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { fileKeysOf } from "./document.mapper";

describe("fileKeysOf", () => {
  it("ne garde que les clés des fichiers, dans l'ordre", () => {
    expect(
      fileKeysOf([
        { type: DocumentType.FILE, storagePath: "coach/c/exercises/e/a.jpg" },
        { type: DocumentType.LINK, storagePath: null },
        { type: DocumentType.FILE, storagePath: null },
        { type: DocumentType.FILE, storagePath: "coach/c/exercises/e/b.pdf" },
      ]),
    ).toEqual(["coach/c/exercises/e/a.jpg", "coach/c/exercises/e/b.pdf"]);
  });

  it("rend une liste vide sans document", () => {
    expect(fileKeysOf([])).toEqual([]);
  });
});

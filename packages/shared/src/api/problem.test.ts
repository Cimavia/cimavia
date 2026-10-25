import { describe, expect, it } from "vitest";
import { ABOUT_BLANK, ProblemType, problemDetailsSchema, toJsonPointer } from "./problem";

describe("toJsonPointer", () => {
  it.each([
    [[], "#"],
    [["title"], "#/title"],
    [["blocks", 0, "name"], "#/blocks/0/name"],
    // RFC 6901 : `~` puis `/` s'échappent, dans cet ordre.
    [["a/b", "c~d"], "#/a~1b/c~0d"],
  ] as const)("%j → %s", (path, pointer) => {
    expect(toJsonPointer(path)).toBe(pointer);
  });
});

describe("problemDetailsSchema", () => {
  it("accepte l'exemple de validation de la RFC 9457", () => {
    const body = {
      type: ABOUT_BLANK,
      title: "Bad Request",
      status: 400,
      errors: [{ detail: "Ce champ est requis.", pointer: "#/blocks/0/name" }],
    };

    expect(problemDetailsSchema.parse(body)).toEqual(body);
  });

  it("refuse ce qui n'est pas un problème, ou un statut qui n'est pas une erreur", () => {
    expect(problemDetailsSchema.safeParse({ message: "Interdit", statusCode: 403 }).success).toBe(
      false,
    );
    expect(
      problemDetailsSchema.safeParse({ type: ABOUT_BLANK, title: "OK", status: 200 }).success,
    ).toBe(false);
  });

  it("nomme chaque code en URN non résoluble", () => {
    for (const type of Object.values(ProblemType)) {
      expect(type).toMatch(/^urn:cimavia:problem:[a-z-]+$/);
    }
  });
});

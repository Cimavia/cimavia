import { describe, expect, it } from "vitest";
import {
  ACCESS_MAX_TARGETS,
  changeAccessSchema,
  LibraryScope,
  libraryScopeQuerySchema,
  libraryScopeSchema,
} from "./access.schema";

describe("libraryScopeQuerySchema", () => {
  it("vaut « all » sans paramètre", () => {
    expect(libraryScopeQuerySchema.parse({})).toEqual({ scope: LibraryScope.ALL });
  });

  it.each(["all", "mine", "shared"])("accepte %s", (scope) => {
    expect(libraryScopeQuerySchema.parse({ scope }).scope).toBe(scope);
  });

  it("refuse une portée inconnue", () => {
    expect(libraryScopeQuerySchema.safeParse({ scope: "others" }).success).toBe(false);
  });

  it("se lit aussi seule, à côté des autres filtres d'une liste", () => {
    expect(libraryScopeSchema.parse(undefined)).toBe(LibraryScope.ALL);
    expect(libraryScopeSchema.safeParse("others").success).toBe(false);
  });
});

const distinctIds = (count: number) => Array.from({ length: count }, (_, i) => `e${i}`);

describe("changeAccessSchema", () => {
  const valid = { ids: ["e1", "e2"], changes: [{ organizationId: "f", level: "WRITE" }] };

  it("accepte un changement, et null pour « Aucun »", () => {
    expect(changeAccessSchema.parse(valid)).toEqual(valid);
    const none = { ...valid, changes: [{ organizationId: "f", level: null }] };
    expect(changeAccessSchema.parse(none)).toEqual(none);
  });

  it("refuse NONE sur la ligne d'une entreprise : « Aucun » y est l'absence de ligne", () => {
    const input = { ...valid, changes: [{ organizationId: "f", level: "NONE" }] };
    expect(changeAccessSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["sans élément", { ...valid, ids: [] }],
    ["sans changement", { ...valid, changes: [] }],
    ["un élément cité deux fois", { ...valid, ids: ["e1", "e1"] }],
    [
      "une entreprise citée deux fois",
      {
        ...valid,
        changes: [
          { organizationId: "f", level: "READ" },
          { organizationId: "f", level: "WRITE" },
        ],
      },
    ],
    ["trop d'éléments", { ...valid, ids: distinctIds(ACCESS_MAX_TARGETS + 1) }],
    ["un champ inconnu", { ...valid, replace: true }],
  ])("refuse %s", (_, input) => {
    expect(changeAccessSchema.safeParse(input).success).toBe(false);
  });

  it("accepte le plafond exact", () => {
    expect(
      changeAccessSchema.safeParse({ ...valid, ids: distinctIds(ACCESS_MAX_TARGETS) }).success,
    ).toBe(true);
  });
});

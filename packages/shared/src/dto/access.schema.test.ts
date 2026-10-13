import { describe, expect, it } from "vitest";
import {
  ACCESS_MAX_TARGETS,
  accessGrantDtoSchema,
  accessOwnerSchema,
  changeAccessSchema,
  coachOrganizationDtoSchema,
  elementAccessDtoSchema,
  LibraryScope,
  libraryScopeQuerySchema,
  libraryScopeSchema,
  myAccessSchema,
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
  const valid = { ids: ["e1", "e2"], changes: [{ organizationId: "org-f", level: "WRITE" }] };

  it("accepte un changement, et null pour « Aucun »", () => {
    expect(changeAccessSchema.parse(valid)).toEqual(valid);
    const none = { ...valid, changes: [{ organizationId: "org-f", level: null }] };
    expect(changeAccessSchema.parse(none)).toEqual(none);
  });

  it("accepte deux entreprises distinctes dans le même lot", () => {
    const input = {
      ...valid,
      changes: [
        { organizationId: "org-f", level: "READ" },
        { organizationId: "org-g", level: null },
      ],
    };
    expect(changeAccessSchema.parse(input)).toEqual(input);
  });

  it.each([
    [{ ...valid, ids: ["e1", "e1"] }, "Un élément ne peut pas être cité deux fois."],
    [
      { ...valid, changes: [valid.changes[0], valid.changes[0]] },
      "Une entreprise ne peut pas être citée deux fois.",
    ],
  ])("dit pourquoi un doublon est refusé : %#", (input, message) => {
    expect(changeAccessSchema.safeParse(input).error?.issues[0]?.message).toBe(message);
  });

  it("refuse NONE sur la ligne d'une entreprise : « Aucun » y est l'absence de ligne", () => {
    const input = { ...valid, changes: [{ organizationId: "f", level: "NONE" }] };
    expect(changeAccessSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["sans élément", { ...valid, ids: [] }],
    ["sans changement", { ...valid, changes: [] }],
    [
      "une entreprise sans identifiant",
      { ...valid, changes: [{ organizationId: "", level: "READ" }] },
    ],
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

describe("schémas de réponse des accès", () => {
  const organization = { id: "org-f", name: "F" };

  // Chaque réponse se relit telle quelle, et un champ manquant la rend invalide : le client ne
  // reçoit jamais un droit amputé de son niveau ou de son entreprise.
  it.each([
    ["myAccessSchema", "level", myAccessSchema, { level: "WRITE", via: organization }],
    ["accessOwnerSchema", "name", accessOwnerSchema, { id: "c", name: "C" }],
    ["accessGrantDtoSchema", "organization", accessGrantDtoSchema, { organization, level: "READ" }],
    [
      "elementAccessDtoSchema",
      "grants",
      elementAccessDtoSchema,
      { id: "e1", grants: [{ organization, level: "WRITE" }] },
    ],
    [
      "coachOrganizationDtoSchema",
      "coaches",
      coachOrganizationDtoSchema,
      { ...organization, coaches: [{ coachId: "m", name: "M" }] },
    ],
  ] as const)("%s relit sa réponse et refuse sans « %s »", (_, required, schema, dto) => {
    expect(schema.parse(dto)).toEqual(dto);
    const { [required]: _missing, ...amputated } = dto as Record<string, unknown>;
    expect(schema.safeParse(amputated).success).toBe(false);
  });

  it("refuse une entreprise sans nom, dans un droit comme chez le propriétaire", () => {
    expect(myAccessSchema.safeParse({ level: "READ", via: { id: "org-f" } }).success).toBe(false);
    expect(
      coachOrganizationDtoSchema.safeParse({ ...organization, coaches: [{ coachId: "m" }] })
        .success,
    ).toBe(false);
  });

  it("dit null pour le propriétaire, qui ne tient son droit de personne", () => {
    expect(myAccessSchema.parse({ level: "OWNER", via: null })).toEqual({
      level: "OWNER",
      via: null,
    });
  });
});

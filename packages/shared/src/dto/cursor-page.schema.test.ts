import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CURSOR_PAGE_MAX_LIMIT,
  cursorPageQuerySchema,
  cursorPageSchema,
  pageCursorSchema,
} from "./cursor-page.schema";

describe("cursorPageQuerySchema", () => {
  const schema = cursorPageQuerySchema(50);

  it("prend la taille par défaut, sans curseur, quand rien n'est précisé", () => {
    expect(schema.parse({})).toEqual({ limit: 50 });
  });

  it("lit la taille depuis la chaîne d'une requête", () => {
    expect(schema.parse({ limit: "20", before: "abc_-1" })).toEqual({
      limit: 20,
      before: "abc_-1",
    });
  });

  it.each([
    ["0", "nulle"],
    [String(CURSOR_PAGE_MAX_LIMIT + 1), "au-delà du plafond"],
    ["2.5", "non entière"],
    ["abc", "illisible"],
    ["", "vide"],
  ])("refuse une taille %s (%s)", (limit) => {
    expect(schema.safeParse({ limit }).success).toBe(false);
  });

  it("accepte le plafond", () => {
    expect(schema.parse({ limit: String(CURSOR_PAGE_MAX_LIMIT) }).limit).toBe(
      CURSOR_PAGE_MAX_LIMIT,
    );
  });

  it("tolère ?as=, que lit l'intercepteur de tenancy", () => {
    expect(schema.parse({ as: "coach" })).toEqual({ limit: 50, as: "coach" });
  });

  it("lit la frontière d'une page relue", () => {
    expect(schema.parse({ since: "abc_-1" })).toEqual({ limit: 50, since: "abc_-1" });
  });

  // Les deux à la fois ne désignent aucune page : l'une remonte, l'autre relit la plus récente.
  it("refuse une page d'avant ET une relecture", () => {
    expect(schema.safeParse({ before: "abc", since: "abc" }).success).toBe(false);
  });

  // Écarté, `?cursor=` ferait servir la page la plus récente en boucle.
  it.each(["cursor", "Before", "after"])("refuse un paramètre inconnu : %s", (key) => {
    expect(schema.safeParse({ [key]: "abc" }).success).toBe(false);
  });
});

describe("pageCursorSchema", () => {
  it.each([
    ["", "vide"],
    ["a b", "avec un espace"],
    ["a+b/c=", "en base64 standard plutôt qu'url"],
    ["x".repeat(257), "trop long"],
  ])("refuse un curseur %j (%s)", (cursor) => {
    expect(pageCursorSchema.safeParse(cursor).success).toBe(false);
  });
});

describe("cursorPageSchema", () => {
  const schema = cursorPageSchema(z.object({ id: z.string() }));

  it("accepte la dernière page, sans curseur", () => {
    expect(schema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
  });

  it("exige que le curseur soit dit, même absent", () => {
    expect(schema.safeParse({ items: [{ id: "m1" }] }).success).toBe(false);
  });
});

import { pageCursorSchema } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { cursorPageOf, decodeCursor, encodeCursor, olderThan } from "./cursor-page.util";

const AT = new Date("2026-11-27T10:00:00.123Z");
const row = (id: string, createdAt = AT) => ({ id, createdAt });
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("encodeCursor / decodeCursor", () => {
  it("rend la position encodée, à la milliseconde", () => {
    expect(decodeCursor(encodeCursor(row("m1")))).toEqual(row("m1"));
  });

  // Ce que l'API émet doit passer le schéma de requête par lequel le client le rend.
  it("émet un curseur que le schéma de requête accepte", () => {
    expect(pageCursorSchema.safeParse(encodeCursor(row("cmi0abc_-9"))).success).toBe(true);
  });

  it.each([
    ["du base64url qui n'est pas du JSON", Buffer.from("pas du json").toString("base64url")],
    ["un objet au lieu d'une paire", base64url({ createdAt: AT.toISOString(), id: "m1" })],
    ["une paire incomplète", base64url([AT.toISOString()])],
    ["une date illisible", base64url(["hier", "m1"])],
    ["une date hors du format émis", base64url(["2026-11-27", "m1"])],
    ["un id vide", base64url([AT.toISOString(), ""])],
    ["un id qui n'est pas une chaîne", base64url([AT.toISOString(), 42])],
  ])("refuse %s par un 400", (_, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
  });
});

describe("olderThan", () => {
  it("ne filtre rien sans position : c'est la première page", () => {
    expect(olderThan(null)).toEqual({});
  });

  it("garde ce qui est plus ancien, et à la même date ce qui a un id inférieur", () => {
    expect(olderThan(row("m5"))).toEqual({
      createdAt: { lte: AT },
      OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: "m5" } }],
    });
  });
});

describe("cursorPageOf", () => {
  it("rend les lignes du plus ancien au plus récent", () => {
    const page = cursorPageOf([row("m3"), row("m2"), row("m1")], 3);
    expect(page.rows.map(({ id }) => id)).toEqual(["m1", "m2", "m3"]);
  });

  it("n'a pas de curseur quand rien ne dépasse la page", () => {
    expect(cursorPageOf([row("m2"), row("m1")], 2).nextCursor).toBeNull();
  });

  it("écarte la ligne de trop, et pointe la plus ancienne gardée", () => {
    const page = cursorPageOf([row("m3"), row("m2"), row("m1")], 2);
    expect(page.rows.map(({ id }) => id)).toEqual(["m2", "m3"]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor ?? "")).toEqual(row("m2"));
  });

  it("rend une page vide sans curseur pour un flux vide", () => {
    expect(cursorPageOf([], 50)).toEqual({ rows: [], nextCursor: null });
  });

  it("ne réordonne pas les lignes qu'on lui passe", () => {
    const rows = [row("m2"), row("m1")];
    cursorPageOf(rows, 2);
    expect(rows.map(({ id }) => id)).toEqual(["m2", "m1"]);
  });
});

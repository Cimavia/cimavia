import { CURSOR_PAGE_MAX_LIMIT, pageCursorSchema } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  cursorPageOf,
  decodeCursor,
  encodeCursor,
  notOlderThan,
  olderThan,
  windowSinceOf,
} from "./cursor-page.util";

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

describe("notOlderThan", () => {
  // Le complément d'`olderThan` : la position elle-même en fait partie.
  it("garde ce qui est plus récent, et à la même date ce qui a un id supérieur ou égal", () => {
    expect(notOlderThan(row("m5"))).toEqual({
      createdAt: { gte: AT },
      OR: [{ createdAt: { gt: AT } }, { createdAt: AT, id: { gte: "m5" } }],
    });
  });
});

describe("windowSinceOf", () => {
  const since = encodeCursor(row("m2"));
  const newestFirst = (count: number) =>
    Array.from({ length: count }, (_, i) => row(`m${count - i}`));

  it("rend toute la fenêtre, et garde la frontière tant qu'il reste plus ancien", async () => {
    const page = await windowSinceOf(newestFirst(3), 2, since, async () => true);
    expect(page.rows.map(({ id }) => id)).toEqual(["m1", "m2", "m3"]);
    expect(page.nextCursor).toBe(since);
  });

  // Ce qui était plus ancien a disparu (un compte effacé quitte les fils de groupe).
  it("n'a plus de curseur quand rien ne reste avant la frontière", async () => {
    expect((await windowSinceOf(newestFirst(2), 2, since, async () => false)).nextCursor).toBe(
      null,
    );
  });

  it("rend la page la plus récente, à son curseur, quand la fenêtre déborde le plafond", async () => {
    const hasOlder = vi.fn();
    const rows = newestFirst(CURSOR_PAGE_MAX_LIMIT + 1);

    const page = await windowSinceOf(rows, 2, since, hasOlder);

    expect(page.rows.map(({ id }) => id)).toEqual([
      `m${CURSOR_PAGE_MAX_LIMIT}`,
      `m${CURSOR_PAGE_MAX_LIMIT + 1}`,
    ]);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual(row(`m${CURSOR_PAGE_MAX_LIMIT}`));
    expect(hasOlder).not.toHaveBeenCalled();
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

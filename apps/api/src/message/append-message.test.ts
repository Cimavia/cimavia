import { MessageType } from "@cmv/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { appendMessage, nextMessageDate } from "./append-message";

const LAST = new Date("2026-11-18T10:45:39.595Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("nextMessageDate", () => {
  it("date un message d'un fil encore vide à maintenant", () => {
    const now = new Date("2026-11-18T10:45:37.966Z");

    expect(nextMessageDate(null, now)).toEqual(now);
  });

  it("date à maintenant un message qui suit le dernier", () => {
    const now = new Date("2026-11-18T10:45:40.000Z");

    expect(nextMessageDate(LAST, now)).toEqual(now);
  });

  // Le cas mesuré en #867 : l'horloge a reculé, maintenant tombe AVANT le dernier message.
  it("date une milliseconde après le dernier quand l'horloge a reculé", () => {
    const now = new Date("2026-11-18T10:45:37.966Z");

    expect(nextMessageDate(LAST, now)).toEqual(new Date("2026-11-18T10:45:39.596Z"));
  });

  // À égalité, le fil, trié sur la seule date, prendrait un ordre arbitraire.
  it("ne date pas à égalité avec le dernier", () => {
    expect(nextMessageDate(LAST, new Date(LAST))).toEqual(new Date("2026-11-18T10:45:39.596Z"));
  });

  it("lit l'horloge du serveur quand on ne lui en donne pas", () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T10:46:00.000Z") });

    expect(nextMessageDate(LAST)).toEqual(new Date("2026-11-18T10:46:00.000Z"));
  });

  // Ni la date du dernier message ni maintenant ne sont rendues telles quelles : l'appelant les
  // garde intactes.
  it("rend une date neuve, pas celle du dernier message", () => {
    const next = nextMessageDate(LAST, new Date("2026-11-18T10:45:37.966Z"));

    expect(next).not.toBe(LAST);
    expect(LAST.toISOString()).toBe("2026-11-18T10:45:39.595Z");
  });
});

describe("appendMessage", () => {
  const DATA = { conversationId: "conv1", senderId: "a1", type: MessageType.TEXT, content: "Oui" };

  /** Une transaction qui rend le fil tel qu'elle le relit, et le message tel que Prisma l'écrit. */
  function txWith(lastMessageAt: Date | null | "absent") {
    const findFirst = vi
      .fn()
      .mockResolvedValue(lastMessageAt === "absent" ? null : { lastMessageAt });
    const create = vi.fn(async ({ data }: { data: { createdAt: Date } }) => ({
      id: "m1",
      ...data,
    }));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      conversation: { findFirst, updateMany },
      message: { create },
    } as unknown as TenantTx;
    return { tx, findFirst, create, updateMany };
  }

  // Le fil chargé en début de requête ignore un message validé depuis : c'est le fil relu qui compte.
  it("date le message après le dernier du fil, relu dans la transaction", async () => {
    const lastMessageAt = new Date(Date.now() + 60_000);
    const { tx, findFirst, create } = txWith(lastMessageAt);

    const created = await appendMessage(tx, DATA);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "conv1" },
      select: { lastMessageAt: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: { ...DATA, createdAt: new Date(lastMessageAt.getTime() + 1) },
    });
    expect(created).toMatchObject({ id: "m1", content: "Oui" });
  });

  it("date à maintenant le premier message d'un fil", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T10:46:00.000Z") });
    const { tx, create } = txWith(null);

    await appendMessage(tx, DATA);

    expect(create).toHaveBeenCalledWith({
      data: { ...DATA, createdAt: new Date("2026-11-18T10:46:00.000Z") },
    });
  });

  // Un envoi concurrent validé après celui-ci peut porter une date plus ancienne : il ne ramène
  // pas le fil en arrière, sans quoi le message suivant se daterait sur lui.
  it("remonte le fil à la date du message, jamais à reculons", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T10:46:00.000Z") });
    const { tx, updateMany } = txWith(LAST);

    await appendMessage(tx, DATA);

    const at = new Date("2026-11-18T10:46:00.000Z");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "conv1", OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: at } }] },
      data: { lastMessageAt: at },
    });
  });

  it("n'écrit rien dans un fil qui a disparu", async () => {
    const { tx, create, updateMany } = txWith("absent");

    await expect(appendMessage(tx, DATA)).rejects.toThrow("conversation conv1 introuvable");
    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

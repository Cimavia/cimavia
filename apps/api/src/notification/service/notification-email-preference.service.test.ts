import { EMAILABLE_NOTIFICATION_TYPES, NotificationType } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { NotificationEmailPreferenceService } from "./notification-email-preference.service";

/**
 * Le client tenant réduit à ce que lit ce service. Le `userId` n'apparaît nulle part, et c'est le
 * sujet : il est injecté par l'extension tenant, jamais par le service — le double s'en passe donc
 * exactement comme le vrai code.
 */
function fakeDb(stored: { type: string }[]) {
  const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const createMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const findMany = vi.fn(() => Promise.resolve(stored));
  const tx = { notificationEmailPreference: { deleteMany, createMany } };
  const db = {
    notificationEmailPreference: { findMany },
    $transaction: (run: (t: typeof tx) => Promise<unknown>) => run(tx),
  } as unknown as TenantPrisma;
  return { service: new NotificationEmailPreferenceService(db), deleteMany, createMany };
}

describe("NotificationEmailPreferenceService — lecture", () => {
  // La grille complète, jamais la seule liste des actifs : l'écran de réglages ne doit rien avoir
  // à déduire d'une absence.
  it("rend un état pour chaque type envoyable, dans l'ordre du produit", async () => {
    const { service } = fakeDb([{ type: NotificationType.MESSAGE_RECEIVED }]);

    const grid = await service.list();

    expect(grid.map((row) => row.type)).toEqual([...EMAILABLE_NOTIFICATION_TYPES]);
    expect(grid.filter((row) => row.enabled).map((row) => row.type)).toEqual([
      NotificationType.MESSAGE_RECEIVED,
    ]);
  });

  it("rend tout à off quand rien n'a jamais été réglé", async () => {
    const { service } = fakeDb([]);

    const grid = await service.list();

    expect(grid).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length);
    expect(grid.every((row) => !row.enabled)).toBe(true);
  });

  /**
   * La colonne Prisma porte l'enum COMPLET : une ligne d'un type non envoyable peut exister — un
   * élargissement de la liste, puis un retour en arrière. Elle ne doit rien allumer et ne doit pas
   * apparaître dans la grille. C'est vrai sans défense particulière, et ce test le fige pour qu'on
   * n'aille pas ajouter un filtre là où il n'a rien à filtrer.
   */
  it("reste inoffensif face à une ligne d'un type devenu non envoyable", async () => {
    const { service } = fakeDb([{ type: NotificationType.PLAN_SESSION_ADDED }]);

    const grid = await service.list();

    expect(grid.map((row) => row.type)).toEqual([...EMAILABLE_NOTIFICATION_TYPES]);
    expect(grid.every((row) => !row.enabled)).toBe(true);
  });
});

describe("NotificationEmailPreferenceService — écriture", () => {
  it("supprime ce qui n'est plus demandé et crée le reste, en une transaction", async () => {
    const { service, deleteMany, createMany } = fakeDb([]);

    await service.replace({ enabled: [NotificationType.PLAN_PUBLISHED] });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { type: { notIn: [NotificationType.PLAN_PUBLISHED] } },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ type: NotificationType.PLAN_PUBLISHED }],
      skipDuplicates: true,
    });
  });

  /**
   * Le geste « je coupe tout » : la liste vide donne `notIn: []`, que Prisma rend toujours vrai —
   * donc tout est supprimé. Ce test existe pour qu'on ne « corrige » pas un jour cette absence de
   * cas particulier par une branche qui, elle, ne serait jamais éprouvée.
   */
  it("coupe tout sur une liste vide, sans cas particulier", async () => {
    const { service, deleteMany, createMany } = fakeDb([]);

    await service.replace({ enabled: [] });

    expect(deleteMany).toHaveBeenCalledWith({ where: { type: { notIn: [] } } });
    expect(createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true });
  });

  // Un client peut envoyer deux fois le même type sans que ce soit une faute : c'est l'unicité
  // `[userId, type]` qui le refuserait, en 500. On dédoublonne avant d'écrire.
  it("dédoublonne la liste reçue", async () => {
    const { service, createMany } = fakeDb([]);

    await service.replace({
      enabled: [NotificationType.PLAN_PUBLISHED, NotificationType.PLAN_PUBLISHED],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [{ type: NotificationType.PLAN_PUBLISHED }],
      skipDuplicates: true,
    });
  });
});

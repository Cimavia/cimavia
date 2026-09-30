import { Prisma } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { ConversationService } from "./conversation.service";

const THREAD = { id: "conv_1", coachId: "coach_1", athleteId: "ath_1" };

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

/**
 * Deux ouvertures simultanées du même fil — le coach et l'athlète au même instant, ou un avis de
 * débrief (#96) qui croise l'ouverture de l'écran. Le second `create` viole l'unicité
 * `[coachId, athleteId]`. Les e2e, séquentiels, ne produisent jamais cette course.
 */
function serviceWhere(create: () => Promise<unknown>, reread: unknown) {
  const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(reread);
  const db = { conversation: { findFirst, create: vi.fn(create) } } as unknown as TenantPrisma;
  const service = new ConversationService(db, {} as UserDirectoryService, {} as ClsService);
  return { service, findFirst };
}

describe("ConversationService.ensure — la course à la création", () => {
  it("relit et rend le fil que l'autre ouverture vient de créer", async () => {
    const { service, findFirst } = serviceWhere(() => Promise.reject(uniqueViolation()), THREAD);

    await expect(service.ensure("coach_1", "ath_1")).resolves.toBe(THREAD);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { coachId: "coach_1", athleteId: "ath_1" },
    });
  });

  // Violation d'unicité, et pourtant rien à relire : l'état est incohérent, on ne l'invente pas.
  it("laisse remonter la violation quand le fil reste introuvable", async () => {
    const violation = uniqueViolation();
    const { service } = serviceWhere(() => Promise.reject(violation), null);

    await expect(service.ensure("coach_1", "ath_1")).rejects.toBe(violation);
  });

  it("laisse remonter toute autre erreur sans relire", async () => {
    const outage = new Error("connexion perdue");
    const { service, findFirst } = serviceWhere(() => Promise.reject(outage), THREAD);

    await expect(service.ensure("coach_1", "ath_1")).rejects.toBe(outage);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("laisse remonter une erreur Prisma qui n'est pas une violation d'unicité", async () => {
    const fkViolation = new Prisma.PrismaClientKnownRequestError("Foreign key", {
      code: "P2003",
      clientVersion: "test",
    });
    const { service, findFirst } = serviceWhere(() => Promise.reject(fkViolation), THREAD);

    await expect(service.ensure("coach_1", "ath_1")).rejects.toBe(fkViolation);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

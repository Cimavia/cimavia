import { ProblemType } from "@cmv/shared";
import { Prisma } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import { AthleteSheetService } from "./athlete-sheet.service";

const COACH: TenantContext = {
  userId: "usr_coach",
  capabilities: { isCoach: true, isAthlete: false, isCompany: false },
  exercised: "coach",
};

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Erreur ${code}`, { code, clientVersion: "test" });

function serviceCreatingWith(error: Error) {
  const db = {
    coachAthlete: { findFirst: () => Promise.resolve({ endedAt: null }) },
    athleteSheet: { create: () => Promise.reject(error) },
  } as unknown as TenantPrisma;
  const cls = { get: () => COACH } as unknown as ClsService;
  return new AthleteSheetService(db, cls);
}

/**
 * Les e2e montrent le 409 sur une vraie base, création concurrente comprise. Ici, l'autre moitié,
 * qu'une base saine ne produit pas : seule la violation d'unicité est un conflit. Un 409 « la fiche
 * a changé » sur une base tombée ferait recharger une fiche que personne n'a touchée.
 */
describe("AthleteSheetService.upsert — première fiche", () => {
  const FIRST = { content: "Objectif 8a", expectedUpdatedAt: null };

  it("traduit une fiche née entre-temps en conflit d'édition", async () => {
    await expect(
      serviceCreatingWith(knownError("P2002")).upsert("ath_1", FIRST),
    ).rejects.toMatchObject({ status: 409, problemType: ProblemType.STALE_WRITE });
  });

  it.each([
    ["une autre erreur connue de Prisma", knownError("P2000")],
    ["une panne sans code", new Error("base injoignable")],
  ])("laisse remonter %s sans la déguiser en conflit", async (_label, error) => {
    await expect(serviceCreatingWith(error).upsert("ath_1", FIRST)).rejects.toBe(error);
  });
});

/** Le lien rompu garde sa fiche en lecture, et la ferme en écriture (#909). */
describe("AthleteSheetService — suivi terminé", () => {
  function serviceOfEndedLink() {
    const sheet = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
    const db = {
      coachAthlete: { findFirst: vi.fn().mockResolvedValue({ endedAt: new Date("2026-11-20") }) },
      athleteSheet: sheet,
    } as unknown as TenantPrisma;
    return {
      service: new AthleteSheetService(db, { get: () => COACH } as unknown as ClsService),
      sheet,
    };
  }

  it("relit la fiche d'un athlète dont le suivi est terminé", async () => {
    const { service, sheet } = serviceOfEndedLink();

    await expect(service.get("ath_1")).resolves.toBeNull();
    expect(sheet.findFirst).toHaveBeenCalledWith({ where: { athleteId: "ath_1" } });
  });

  it("refuse de l'écrire, sans rien toucher (409)", async () => {
    const { service, sheet } = serviceOfEndedLink();

    await expect(
      service.upsert("ath_1", { content: "Objectif 8a", expectedUpdatedAt: null }),
    ).rejects.toMatchObject({ status: 409, problemType: ProblemType.FOLLOW_ENDED });
    expect(sheet.create).not.toHaveBeenCalled();
  });
});

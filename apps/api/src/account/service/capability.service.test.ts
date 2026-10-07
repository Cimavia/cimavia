import { ForbiddenException } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import { CapabilityService } from "./capability.service";

const COMPANY: TenantContext = {
  userId: "usr_f",
  capabilities: { isCoach: false, isAthlete: false, isCompany: true },
  exercised: null,
};

describe("CapabilityService.update — compte Entreprise (#600)", () => {
  /**
   * Le reste du service se vérifie en e2e, sur une vraie base. Ce cas-ci se joue AVANT toute
   * requête : c'est ce que le test fige — refus en 403, et rien d'écrit, pas même une lecture.
   */
  it("refuse toute capacité à une entreprise, sans toucher la base", async () => {
    const transaction = vi.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const cls = { get: () => COMPANY } as unknown as ClsService;

    await expect(
      new CapabilityService(prisma, cls).update({ isCoach: true, isAthlete: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
});

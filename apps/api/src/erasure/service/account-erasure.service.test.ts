import { ConflictException, HttpStatus, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthService } from "@thallesp/nestjs-better-auth";
import type { ClsService } from "nestjs-cls";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import type { ExerciseCopyService } from "../../exercise/service/exercise-copy.service";
import type { AccountErasedMailer } from "../../infra/mail/account-erased.mailer";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { AccountErasureService } from "./account-erasure.service";
import type { ErasureAttemptsService } from "./erasure-attempts.service";

const USER = { name: "Camille", email: "c@cmv.test", locale: "fr" };

/** Une transaction sur une base vide : `deleted` lignes `User` retirées. */
function emptyTx(deleted: number) {
  const table = {
    findMany: async () => [],
    findFirst: async () => null,
    updateMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
    deleteMany: async () => ({ count: deleted }),
  };
  return new Proxy({}, { get: () => table });
}

function serviceWith(options: {
  user?: typeof USER | null;
  account?: { password: string | null } | null;
  passwordOk?: boolean;
  transaction?: () => Promise<unknown>;
  deleted?: number;
}) {
  const purge = { drainSafely: vi.fn().mockResolvedValue(0) };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const attempts = { consume: vi.fn(), clear: vi.fn() };
  const verify = vi.fn().mockResolvedValue(options.passwordOk ?? true);
  const logger = { info: vi.fn(), warn: vi.fn() };
  const tx = emptyTx(options.deleted ?? 1);
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(options.user === undefined ? USER : options.user),
    },
    account: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.account === undefined ? { password: "h" } : options.account),
    },
    sessionExercise: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(
      options.transaction ?? ((run: (client: unknown) => Promise<unknown>) => run(tx)),
    ),
  };
  const service = new AccountErasureService(
    prisma as unknown as PrismaService,
    {} as TenantPrisma,
    {} as ClsService,
    {} as ExerciseCopyService,
    {} as CustomMetricService,
    purge as unknown as ObjectPurgeService,
    mailer as unknown as AccountErasedMailer,
    attempts as unknown as ErasureAttemptsService,
    { instance: { $context: Promise.resolve({ password: { verify } }) } } as unknown as AuthService,
    logger as unknown as PinoLogger,
  );
  return { service, purge, mailer, attempts, verify, prisma, logger };
}

const REJECTED = expect.objectContaining({ status: HttpStatus.FORBIDDEN });

describe("AccountErasureService.eraseWithPassword", () => {
  it("refuse un mot de passe faux sans rien effacer, et l'essai reste compté", async () => {
    const { service, prisma, attempts } = serviceWith({ passwordOk: false });
    await expect(service.eraseWithPassword("u", "faux")).rejects.toEqual(REJECTED);
    expect(attempts.consume).toHaveBeenCalledWith("u");
    expect(attempts.clear).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["sans compte à mot de passe", null],
    ["dont le mot de passe est vide", { password: null }],
  ])("refuse un compte %s, sans rien vérifier", async (_label, account) => {
    const { service, verify } = serviceWith({ account });
    await expect(service.eraseWithPassword("u", "x")).rejects.toEqual(REJECTED);
    expect(verify).not.toHaveBeenCalled();
  });

  it("libère l'essai dès le bon mot de passe : un 409 à rejouer n'use pas le plafond", async () => {
    const violation = new Prisma.PrismaClientKnownRequestError("fk", {
      code: "P2003",
      clientVersion: "test",
    });
    const { service, attempts, mailer } = serviceWith({
      transaction: () => Promise.reject(violation),
    });
    await expect(service.eraseWithPassword("u", "bon")).rejects.toBeInstanceOf(ConflictException);
    expect(attempts.clear).toHaveBeenCalledWith("u");
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("confirme par e-mail et lance la purge", async () => {
    const { service, mailer, purge } = serviceWith({});
    await service.eraseWithPassword("u", "bon");
    expect(mailer.send).toHaveBeenCalledWith({ to: USER.email, locale: USER.locale });
    expect(purge.drainSafely).toHaveBeenCalledOnce();
  });
});

describe("AccountErasureService.erase", () => {
  it("répond introuvable pour un compte déjà parti, sans transaction", async () => {
    const { service, prisma } = serviceWith({ user: null });
    await expect(service.erase("u")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("répond introuvable si un autre envoi a tout effacé pendant celui-ci", async () => {
    const { service, mailer } = serviceWith({ deleted: 0 });
    await expect(service.erase("u")).rejects.toBeInstanceOf(NotFoundException);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("ne réécrit pas à la personne quand on rejoue après une restauration", async () => {
    const { service, mailer, logger } = serviceWith({});
    await service.erase("u", { notify: false });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ userId: "u" }, "account.erased");
  });

  it("attend la purge : la commande ferme la base juste après", async () => {
    const { service, purge } = serviceWith({});
    let purged = false;
    purge.drainSafely.mockImplementation(async () => {
      await Promise.resolve();
      purged = true;
      return 0;
    });
    await service.erase("u");
    expect(purged).toBe(true);
  });
});

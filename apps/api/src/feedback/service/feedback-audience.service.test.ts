import type { SessionFeedback } from "@prisma/client";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_SCOPES } from "../../tenancy/tenant-scope";
import { FeedbackAudienceService } from "./feedback-audience.service";

const FEEDBACK = { id: "f1", coachId: "c1", athleteId: "ti" } as SessionFeedback;

/**
 * Les liens de l'athlète, et les Coachs que le filtre de lecture laisse passer : la liste se décide
 * entièrement sur ces deux lectures. Le faux client de base reconnaît le Coach dont le filtre est
 * posé en le comparant au filtre du registre — le vrai filtre, pas une copie.
 */
function build(links: readonly string[] | Error, readers: readonly string[]) {
  const findLinks =
    links instanceof Error
      ? vi.fn().mockRejectedValue(links)
      : vi.fn().mockResolvedValue(links.map((coachId) => ({ coachId })));
  const scope = TENANT_SCOPES.SessionFeedback?.coach;
  const count = vi.fn(async ({ where }: { where: { AND: unknown[] } }) => {
    const reader = readers.find(
      (coachId) => JSON.stringify(where.AND[1]) === JSON.stringify(scope?.where(coachId, "read")),
    );
    return reader == null ? 0 : 1;
  });
  const logger = { error: vi.fn() };
  const service = new FeedbackAudienceService(
    { coachAthlete: { findMany: findLinks } } as unknown as TenantPrisma,
    { sessionFeedback: { count } } as unknown as PrismaService,
    logger as unknown as PinoLogger,
  );
  return { service, findLinks, count, logger };
}

describe("FeedbackAudienceService.recipientsOf", () => {
  // C possède le cycle, M le lit par F ; B suit TI hors de F et n'y a aucun droit.
  it("garde le propriétaire et les Coachs de l'athlète qui lisent le débrief", async () => {
    const { service, findLinks } = build(["c1", "m1", "b1"], ["c1", "m1"]);

    expect(await service.recipientsOf(FEEDBACK)).toEqual(["c1", "m1"]);
    expect(findLinks).toHaveBeenCalledWith({
      where: { athleteId: "ti", status: "ACTIVE" },
      select: { coachId: true },
    });
  });

  // Son lien a pris fin, mais le cycle reste à lui : il le lit toujours.
  it("compte le propriétaire du cycle même sans lien actif", async () => {
    const { service } = build(["m1"], ["c1", "m1"]);

    expect(await service.recipientsOf(FEEDBACK)).toEqual(["c1", "m1"]);
  });

  // Auto-coaching (#316) : l'athlète est son propre Coach, il n'a personne à prévenir.
  it("n'inclut jamais l'athlète lui-même", async () => {
    const { service, count } = build([], ["ti"]);

    expect(await service.recipientsOf({ ...FEEDBACK, coachId: "ti" })).toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });

  it("relit le débrief lui-même, sous le filtre de chaque candidat", async () => {
    const { service, count } = build(["m1"], []);

    await service.recipientsOf(FEEDBACK);

    expect(count).toHaveBeenCalledWith({
      where: { AND: [{ id: "f1" }, TENANT_SCOPES.SessionFeedback?.coach?.where("m1", "read")] },
    });
  });

  // Le débrief est écrit : une lecture en panne ne le fait pas échouer, elle prévient le minimum.
  it("se rabat sur le propriétaire du cycle quand la lecture échoue, et le journalise", async () => {
    const { service, logger } = build(new Error("db down"), []);

    expect(await service.recipientsOf(FEEDBACK)).toEqual(["c1"]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ sessionFeedbackId: "f1" }),
      expect.any(String),
    );
  });

  it("ne se rabat sur personne en auto-coaching", async () => {
    const { service } = build(new Error("db down"), []);

    expect(await service.recipientsOf({ ...FEEDBACK, coachId: "ti" })).toEqual([]);
  });
});

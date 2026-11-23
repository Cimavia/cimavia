import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import { retentionCutoff } from "../../util/retention.util";
import { NotificationRetentionService } from "./notification-retention.service";

describe("NotificationRetentionService", () => {
  it("purge les notifications lues avant le seuil de rétention, et rend leur nombre", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const service = new NotificationRetentionService({
      notification: { deleteMany },
    } as unknown as PrismaService);
    const now = new Date("2026-11-23T10:00:00.000Z");

    expect(await service.purgeRead(now)).toBe(3);
    // Le seul critère est la date de LECTURE : une non-lue (`readAt` NULL) n'y répond jamais.
    expect(deleteMany).toHaveBeenCalledWith({ where: { readAt: { lt: retentionCutoff(now) } } });
  });
});

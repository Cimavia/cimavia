import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { coachesWhoRead } from "./coach-reads";
import { TENANT_SCOPES } from "./tenant-scope";

/** Un client de base dont chaque modèle répond « lu » pour les seuls Coachs qu'on lui donne. */
function prismaReadBy(model: "scheduledSession" | "sessionFeedback", readers: readonly string[]) {
  const registered = model === "scheduledSession" ? "ScheduledSession" : "SessionFeedback";
  const scope = TENANT_SCOPES[registered]?.coach;
  const count = vi.fn(async ({ where }: { where: { AND: unknown[] } }) =>
    readers.some(
      (coachId) => JSON.stringify(where.AND[1]) === JSON.stringify(scope?.where(coachId, "read")),
    )
      ? 1
      : 0,
  );
  const untouched = vi.fn();
  const prisma = {
    scheduledSession: { count: model === "scheduledSession" ? count : untouched },
    sessionFeedback: { count: model === "sessionFeedback" ? count : untouched },
  } as unknown as PrismaClient;
  return { prisma, count, untouched };
}

describe("coachesWhoRead", () => {
  it("garde les Coachs que le filtre de lecture de la séance laisse passer", async () => {
    const { prisma, count, untouched } = prismaReadBy("scheduledSession", ["m1"]);

    expect(await coachesWhoRead(prisma, "ScheduledSession", "s1", ["c1", "m1"])).toEqual(["m1"]);
    expect(count).toHaveBeenCalledWith({
      where: { AND: [{ id: "s1" }, TENANT_SCOPES.ScheduledSession?.coach?.where("c1", "read")] },
    });
    expect(untouched).not.toHaveBeenCalled();
  });

  it("relit un débrief par son propre modèle", async () => {
    const { prisma, untouched } = prismaReadBy("sessionFeedback", ["c1", "m1"]);

    expect(await coachesWhoRead(prisma, "SessionFeedback", "f1", ["c1", "m1"])).toEqual([
      "c1",
      "m1",
    ]);
    expect(untouched).not.toHaveBeenCalled();
  });

  it("ne lit rien sans candidat", async () => {
    const { prisma, count } = prismaReadBy("sessionFeedback", []);

    expect(await coachesWhoRead(prisma, "SessionFeedback", "f1", [])).toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });
});

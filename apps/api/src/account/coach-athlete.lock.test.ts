import { CoachAthleteStatus, ProblemType } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { holdActiveLink } from "./coach-athlete.lock";

function txReturning(rows: { status: string }[]) {
  return { $queryRaw: vi.fn().mockResolvedValue(rows) };
}

describe("holdActiveLink", () => {
  it("tient un lien actif sous verrou partagé", async () => {
    const tx = txReturning([{ status: CoachAthleteStatus.ACTIVE }]);

    await expect(holdActiveLink(tx as never, "c1", "a1")).resolves.toBeUndefined();
    const [sql, ...values] = tx.$queryRaw.mock.calls[0] ?? [];
    expect((sql as TemplateStringsArray).join("?")).toContain("FOR SHARE");
    expect(values).toEqual(["c1", "a1"]);
  });

  it("refuse un lien rompu (409 FOLLOW_ENDED)", async () => {
    const tx = txReturning([{ status: CoachAthleteStatus.ENDED }]);

    await expect(holdActiveLink(tx as never, "c1", "a1")).rejects.toMatchObject({
      status: 409,
      problemType: ProblemType.FOLLOW_ENDED,
    });
  });

  it("refuse un lien parti avec un compte supprimé (400)", async () => {
    await expect(holdActiveLink(txReturning([]) as never, "c1", "a1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // L'auto-coaching n'a pas de lien (#11) : rien à verrouiller, rien à relire.
  it("ne lit rien pour un cycle qu'on s'écrit à soi-même", async () => {
    const tx = txReturning([]);

    await holdActiveLink(tx as never, "c1", "c1");

    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

import { ProblemType } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { assertFollowOngoing, FollowEndedException } from "./follow-ended.util";

describe("assertFollowOngoing", () => {
  it("laisse écrire tant que le suivi continue", () => {
    expect(() => assertFollowOngoing(null)).not.toThrow();
  });

  it("refuse en 409 FOLLOW_ENDED une fois le suivi terminé", () => {
    expect(() => assertFollowOngoing(new Date("2026-11-20"))).toThrow(FollowEndedException);
    expect(new FollowEndedException()).toMatchObject({
      status: 409,
      problemType: ProblemType.FOLLOW_ENDED,
    });
  });
});

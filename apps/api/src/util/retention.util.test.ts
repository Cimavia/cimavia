import { describe, expect, it } from "vitest";
import { retentionCutoff } from "./retention.util";

describe("retentionCutoff", () => {
  it("recule de la durée de rétention, à la milliseconde", () => {
    expect(retentionCutoff(new Date("2026-11-23T10:00:00.000Z"))).toEqual(
      new Date("2026-05-27T10:00:00.000Z"),
    );
  });
});

import { describe, expect, it } from "vitest";
import { parsePlanBuilderSearch as parse } from "@/routes/plans.$planId";

describe("parsePlanBuilderSearch", () => {
  it("retient la séance que Dosage demande d'ouvrir", () => {
    expect(parse({ session: "ss-1" })).toEqual({ session: "ss-1" });
  });

  it("ne retient ni une séance vide ou malformée, ni rien d'autre", () => {
    expect(parse({})).toEqual({});
    expect(parse({ session: "" })).toEqual({});
    expect(parse({ session: 42, week: "pw-1" })).toEqual({});
  });
});

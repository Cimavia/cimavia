import { describe, expect, it } from "vitest";
import { parseDosageSearch as parse } from "@/routes/plans.$planId_.dosage";

describe("parseDosageSearch", () => {
  it("retient la séance-type que Dosage règle", () => {
    expect(parse({ type: "tpl-1" })).toEqual({ type: "tpl-1" });
  });

  it("ne retient ni une séance-type vide ou malformée, ni rien d'autre", () => {
    expect(parse({})).toEqual({});
    expect(parse({ type: "" })).toEqual({});
    expect(parse({ type: 42, session: "ss-1" })).toEqual({});
  });
});

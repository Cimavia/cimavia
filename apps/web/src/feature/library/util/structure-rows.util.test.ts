import { STRUCTURE_PRESETS, type StructureDto, StructurePresetKey } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { structureRows } from "./structure-rows.util";

const NAMES: Record<StructurePresetKey, string> = {
  SERIES: "Séries",
  EMOM: "EMOM",
  AMRAP: "AMRAP",
  TABATA: "Tabata",
  FOR_TIME: "For time",
  FREE: "Libre",
};

const mine = (name: string, tags: string[]) =>
  ({ id: name, name, tags, settings: STRUCTURE_PRESETS.SERIES }) as unknown as StructureDto;

const library = {
  presets: Object.values(StructurePresetKey).map((key) => ({ key, sessionCount: 0 })),
  structures: [mine("4×4 grimpe", ["grimpe"]), mine("Départs 4 min", ["cardio", "course"])],
};

const rowsOf = (search: string, tags: string[] = []) =>
  structureRows(library, { search, tags }, (key) => NAMES[key]);

describe("structureRows", () => {
  it("sans filtre, montre tout dans l'ordre reçu", () => {
    const rows = rowsOf("");
    expect(rows.presets.map((row) => row.key)).toEqual(Object.values(StructurePresetKey));
    expect(rows.mine.map((row) => row.name)).toEqual(["4×4 grimpe", "Départs 4 min"]);
  });

  it("cherche dans le nom affiché des prêtes et le nom des miennes, sans accent", () => {
    const rows = rowsOf("series");
    expect(rows.presets.map((row) => row.key)).toEqual([StructurePresetKey.SERIES]);
    expect(rowsOf("depart").mine.map((row) => row.name)).toEqual(["Départs 4 min"]);
  });

  it("un tag écarte les structures prêtes, qui n'en ont pas", () => {
    const rows = rowsOf("", ["cardio"]);
    expect(rows.presets).toEqual([]);
    expect(rows.mine.map((row) => row.name)).toEqual(["Départs 4 min"]);
  });

  it("plusieurs tags élargissent (#654)", () => {
    expect(rowsOf("", ["cardio", "grimpe"]).mine).toHaveLength(2);
  });
});

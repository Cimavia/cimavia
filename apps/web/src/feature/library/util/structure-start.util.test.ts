import {
  NEW_STRUCTURE_SETTINGS,
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructureLibraryDto,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { structureStart } from "./structure-start.util";

const mine = {
  id: "st-1",
  name: "4×4 grimpe",
  tags: ["grimpe"],
  note: "Garder 4 min.",
  instructions: "Pars au bip.",
  settings: STRUCTURE_PRESETS.EMOM,
} as StructureDto;
const library: StructureLibraryDto = {
  presets: [],
  structures: [mine, { ...mine, id: "st-2", name: "Tabata (copie)" }],
};
const names = {
  preset: (key: string) => (key === "TABATA" ? "Tabata" : key),
  copy: (base: string, n: number) => (n === 1 ? `${base} (copie)` : `${base} (copie ${n})`),
};

describe("structureStart", () => {
  it("sans source, ouvre une structure neuve et sans nom", () => {
    expect(structureStart(undefined, library, names)).toEqual({
      input: {
        name: "",
        tags: [],
        note: null,
        instructions: null,
        settings: NEW_STRUCTURE_SETTINGS,
      },
      basedOn: null,
    });
  });

  it("d'après une structure prête, en reprend les réglages sous un nom libre", () => {
    const start = structureStart("TABATA", library, names);

    expect(start.basedOn).toBe("Tabata");
    expect(start.input.name).toBe("Tabata (copie 2)");
    expect(start.input.settings).toEqual(STRUCTURE_PRESETS.TABATA);
    expect(start.input.tags).toEqual([]);
  });

  it("d'après une structure du Coach, en reprend tout sauf le nom", () => {
    expect(structureStart("st-1", library, names)).toEqual({
      input: {
        name: "4×4 grimpe (copie)",
        tags: ["grimpe"],
        note: "Garder 4 min.",
        instructions: "Pars au bip.",
        settings: STRUCTURE_PRESETS.EMOM,
      },
      basedOn: "4×4 grimpe",
    });
  });

  it("une source inconnue ouvre une structure neuve", () => {
    expect(structureStart("disparue", library, names).basedOn).toBeNull();
    // Une clé héritée d'`Object` n'est pas une structure prête.
    expect(structureStart("toString", library, names).input.name).toBe("");
  });
});

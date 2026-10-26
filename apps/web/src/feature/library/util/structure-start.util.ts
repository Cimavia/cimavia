import {
  NEW_STRUCTURE_SETTINGS,
  STRUCTURE_PRESETS,
  type StructureInput,
  type StructureLibraryDto,
  StructurePresetKey,
  structureCopyName,
} from "@cmv/shared";

/** D'où part une création : rien, une structure prête, ou l'une de celles du Coach. */
export type StructureStart = {
  input: StructureInput;
  /** Le nom de la structure copiée, que l'en-tête cite (« d'après Tabata ») ; `null` sans copie. */
  basedOn: string | null;
};

type StartNames = {
  /** Le nom d'une structure prête, dans la langue du Coach. */
  preset: (key: StructurePresetKey) => string;
  /** La forme d'une copie, `n` à partir de 1 (`structureCopyName`). */
  copy: (base: string, n: number) => string;
};

const BLANK: StructureInput = {
  name: "",
  tags: [],
  note: null,
  instructions: null,
  settings: NEW_STRUCTURE_SETTINGS,
};

/**
 * Le brouillon d'une création. `from` vient de l'URL : la clé d'une structure prête, ou l'id d'une
 * structure du Coach. La copie garde tout de sa source, sauf le nom, qui doit rester unique.
 *
 * Une source inconnue — une structure supprimée depuis, une URL réécrite à la main — ouvre une
 * structure neuve : le Coach crée ce qu'il venait créer, sans copie à reprendre.
 */
export function structureStart(
  from: string | undefined,
  library: StructureLibraryDto,
  names: StartNames,
): StructureStart {
  if (from == null) return { input: BLANK, basedOn: null };
  const taken = library.structures.map((structure) => structure.name);

  if (isPresetKey(from)) {
    const name = names.preset(from);
    return {
      input: {
        ...BLANK,
        name: structureCopyName(name, taken, names.copy),
        settings: STRUCTURE_PRESETS[from],
      },
      basedOn: name,
    };
  }
  const source = library.structures.find((structure) => structure.id === from);
  if (source == null) return { input: BLANK, basedOn: null };
  return {
    input: {
      name: structureCopyName(source.name, taken, names.copy),
      tags: source.tags,
      note: source.note,
      instructions: source.instructions,
      settings: source.settings,
    },
    basedOn: source.name,
  };
}

function isPresetKey(value: string): value is StructurePresetKey {
  return Object.hasOwn(StructurePresetKey, value);
}

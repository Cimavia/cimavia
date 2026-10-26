import {
  matchesTagFilter,
  type StructureDto,
  type StructureLibraryDto,
  type StructurePresetKey,
  searchMatcher,
} from "@cmv/shared";

/** Une structure prête, telle que la liste la montre : sa clé et son compteur « Séances ». */
export type PresetRow = StructureLibraryDto["presets"][number];

export type StructureRows = {
  presets: PresetRow[];
  mine: StructureDto[];
};

/**
 * Ce que l'onglet Structures montre sous la recherche et les tags (#717). Les structures prêtes
 * n'ont pas de tags : un tag choisi les écarte toutes (frame 1 bis). La recherche lit leur nom
 * dans la langue du Coach (`presetName`), comme il le voit.
 */
export function structureRows(
  library: StructureLibraryDto,
  filters: { search: string; tags: readonly string[] },
  presetName: (key: StructurePresetKey) => string,
): StructureRows {
  const matches = searchMatcher(filters.search);
  return {
    presets:
      filters.tags.length > 0 ? [] : library.presets.filter((row) => matches(presetName(row.key))),
    mine: library.structures.filter(
      (structure) => matchesTagFilter(structure.tags, filters.tags) && matches(structure.name),
    ),
  };
}

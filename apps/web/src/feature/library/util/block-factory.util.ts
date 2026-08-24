import {
  type BlockShortcut,
  type BlockStructure,
  type BlockType,
  DEFAULT_BLOCK_METRIC_KEYS,
  DEFAULT_BLOCK_STRUCTURE,
  defaultUnitOf,
  type ExerciseBlock,
  type MetricKey,
  MetricSource,
  SHORTCUT_PRESETS,
} from "@cmv/shared";

const newId = () => crypto.randomUUID();

function toColumn(key: MetricKey): ExerciseBlock["metrics"][number] {
  return {
    id: newId(),
    source: MetricSource.CATALOG,
    key,
    unit: defaultUnitOf(key),
    label: null,
    collapsed: false,
  };
}

function build(structure: BlockStructure, metricKeys: readonly MetricKey[]): ExerciseBlock {
  return {
    id: newId(),
    // Sans libellé : « Travail » ou « Échauffement » n'a de sens qu'à partir de DEUX blocs, et
    // en imposer un au premier obligerait à l'effacer.
    label: null,
    structure,
    metrics: metricKeys.map(toColumn),
    // Aucune ligne : une grille sans ligne garde ses en-têtes et attend. Poser une ligne vide
    // ferait croire à une consigne que le coach n'a pas écrite.
    rows: [],
  };
}

/** Un bloc neuf du type demandé, prêt à être enregistré tel quel. */
export function createBlock(type: BlockType): ExerciseBlock {
  return build(DEFAULT_BLOCK_STRUCTURE[type], DEFAULT_BLOCK_METRIC_KEYS[type]);
}

/**
 * Un bloc neuf issu d'un raccourci. Le résultat est une SÉRIES ordinaire : rien dans le bloc ne
 * garde trace du raccourci, et c'est le point — le rendu, les timers et le suivi n'ont pas un cas
 * de plus à connaître.
 */
export function createShortcutBlock(shortcut: BlockShortcut): ExerciseBlock {
  const preset = SHORTCUT_PRESETS[shortcut];
  return build(preset.structure, preset.metricKeys);
}

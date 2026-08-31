import { BlockType } from "@cmv/shared";
import { useTranslation } from "react-i18next";

// i18n-values library.builder.blockType: BlockType
// i18n-values library.builder.blockTypeHint: BlockType

const BLOCK_TYPES = [
  BlockType.SERIES,
  BlockType.EMOM,
  BlockType.AMRAP,
  BlockType.CIRCUIT,
  BlockType.FREE,
] as const;

type BlockTypePickerProps = {
  onPickType: (type: BlockType) => void;
};

/**
 * Le choix de structure. Les raccourcis « Pyramide » et « Intervalles » de la maquette ont été
 * retirés : ils ne faisaient que préremplir un bandeau de Séries, et le seul geste qu'ils
 * promettaient vraiment — les paliers en miroir — vit dans le menu de colonne, accessible depuis
 * n'importe quelle Séries.
 */
export function BlockTypePicker({ onPickType }: Readonly<BlockTypePickerProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-sm">
      <div className="grid gap-cmv-sm sm:grid-cols-2 lg:grid-cols-3">
        {BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPickType(type)}
            className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
          >
            <span className="text-cmv-body text-cmv-text-hi">
              {t(`library.builder.blockType.${type}`)}
            </span>
            <span className="text-cmv-caption text-cmv-text-mid">
              {t(`library.builder.blockTypeHint.${type}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

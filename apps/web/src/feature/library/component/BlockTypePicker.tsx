import { BlockShortcut, BlockType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";

// i18n-values library.builder.blockType: BlockType
// i18n-values library.builder.shortcut: BlockShortcut

const BLOCK_TYPES = [
  BlockType.SERIES,
  BlockType.EMOM,
  BlockType.AMRAP,
  BlockType.CIRCUIT,
  BlockType.FREE,
] as const;

const SHORTCUTS = [BlockShortcut.PYRAMID, BlockShortcut.INTERVALS] as const;

type BlockTypePickerProps = {
  onPickType: (type: BlockType) => void;
  onPickShortcut: (shortcut: BlockShortcut) => void;
};

/**
 * Le choix de structure. Les deux raccourcis y figurent, marqués comme tels : ce ne sont pas des
 * types, ils produisent des Séries préréglées. Les présenter comme un sixième et septième type
 * laisserait croire que le rendu athlète les distingue — il ne le fait pas, et ne doit pas.
 */
export function BlockTypePicker({ onPickType, onPickShortcut }: Readonly<BlockTypePickerProps>) {
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

        {SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut}
            type="button"
            onClick={() => onPickShortcut(shortcut)}
            className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-md text-left transition-colors hover:border-cmv-border-hi"
          >
            <span className="flex items-center gap-cmv-xs">
              <span className="text-cmv-body text-cmv-text-hi">
                {t(`library.builder.shortcut.${shortcut}`)}
              </span>
              <CmvBadge>{t("library.builder.shortcutTag")}</CmvBadge>
            </span>
            <span className="text-cmv-caption text-cmv-text-mid">
              {t(`library.builder.shortcutHint.${shortcut}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

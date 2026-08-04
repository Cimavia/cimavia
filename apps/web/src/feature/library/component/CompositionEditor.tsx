import { useTranslation } from "react-i18next";
import type { CompositionRow } from "@/feature/library/hook/useComposition";
import { CmvBadge, CmvButton, CmvEmptyState, CmvTextField } from "@/shared/component";

type CompositionEditorProps = {
  items: readonly CompositionRow[];
  /**
   * Espace de clés i18n — `library.session` ou `plan.session`. Les libellés diffèrent (on ne parle
   * pas d'un modèle et d'une séance datée de la même façon) alors que la manipulation est la même.
   */
  labelPrefix: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPrescriptionChange: (key: string, value: string) => void;
};

// La liste ordonnée des exercices d'une séance : ordre, prescription, retrait.
export function CompositionEditor({
  items,
  labelPrefix,
  onMove,
  onRemove,
  onPrescriptionChange,
}: Readonly<CompositionEditorProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t(`${labelPrefix}.composition`)}</span>

      {items.length === 0 ? (
        <CmvEmptyState
          title={t(`${labelPrefix}.emptyComposition`)}
          description={t(`${labelPrefix}.emptyCompositionHint`)}
        />
      ) : null}

      {items.map((item, index) => (
        <CompositionEditorRow
          key={item.key}
          item={item}
          index={index}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          labelPrefix={labelPrefix}
          onMove={onMove}
          onRemove={onRemove}
          onPrescriptionChange={onPrescriptionChange}
        />
      ))}
    </div>
  );
}

type CompositionEditorRowProps = {
  item: CompositionRow;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  labelPrefix: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPrescriptionChange: (key: string, value: string) => void;
};

function CompositionEditorRow({
  item,
  index,
  isFirst,
  isLast,
  labelPrefix,
  onMove,
  onRemove,
  onPrescriptionChange,
}: Readonly<CompositionEditorRowProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <div className="flex items-center gap-cmv-sm">
        <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
        <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">{item.title}</span>
        <CmvBadge variant="accent">{t(`library.category.${item.category}`)}</CmvBadge>
        <CmvButton
          variant="ghost"
          title={t(`${labelPrefix}.moveUp`)}
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
        >
          ↑
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t(`${labelPrefix}.moveDown`)}
          disabled={isLast}
          onClick={() => onMove(index, 1)}
        >
          ↓
        </CmvButton>
        <CmvButton variant="danger" onClick={() => onRemove(item.key)}>
          {t(`${labelPrefix}.remove`)}
        </CmvButton>
      </div>

      <CmvTextField
        label={t(`${labelPrefix}.prescriptionLabel`)}
        name={`prescription-${item.key}`}
        value={item.prescription}
        onChange={(event) => onPrescriptionChange(item.key, event.target.value)}
        placeholder={t(`${labelPrefix}.prescriptionPlaceholder`)}
      />
    </div>
  );
}

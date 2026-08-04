import { useTranslation } from "react-i18next";
import type { EditorItem } from "@/feature/plan/hook/useSessionComposition";
import { CmvBadge, CmvButton, CmvEmptyState, CmvTextField } from "@/shared/component";

type SessionCompositionEditorProps = {
  items: EditorItem[];
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPrescriptionChange: (key: string, value: string) => void;
};

// La liste ordonnée des exercices de la séance : ordre, prescription, retrait.
export function SessionCompositionEditor({
  items,
  onMove,
  onRemove,
  onPrescriptionChange,
}: Readonly<SessionCompositionEditorProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t("plan.session.composition")}</span>

      {items.length === 0 ? (
        <CmvEmptyState
          title={t("plan.session.emptyComposition")}
          description={t("plan.session.emptyCompositionHint")}
        />
      ) : null}

      {items.map((item, index) => (
        <CompositionRow
          key={item.key}
          item={item}
          index={index}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          onMove={onMove}
          onRemove={onRemove}
          onPrescriptionChange={onPrescriptionChange}
        />
      ))}
    </div>
  );
}

type CompositionRowProps = {
  item: EditorItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPrescriptionChange: (key: string, value: string) => void;
};

function CompositionRow({
  item,
  index,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onPrescriptionChange,
}: Readonly<CompositionRowProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md">
      <div className="flex items-center gap-cmv-sm">
        <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
        <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">{item.title}</span>
        <CmvBadge variant="accent">{t(`library.category.${item.category}`)}</CmvBadge>
        <CmvButton
          variant="ghost"
          title={t("plan.session.moveUp")}
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
        >
          ↑
        </CmvButton>
        <CmvButton
          variant="ghost"
          title={t("plan.session.moveDown")}
          disabled={isLast}
          onClick={() => onMove(index, 1)}
        >
          ↓
        </CmvButton>
        <CmvButton variant="danger" onClick={() => onRemove(item.key)}>
          {t("plan.session.remove")}
        </CmvButton>
      </div>

      <CmvTextField
        label={t("plan.session.prescriptionLabel")}
        name={`prescription-${item.key}`}
        value={item.prescription}
        onChange={(event) => onPrescriptionChange(item.key, event.target.value)}
        placeholder={t("plan.session.prescriptionPlaceholder")}
      />
    </div>
  );
}

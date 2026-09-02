import {
  BLOCK_MAX_METRICS,
  type BlockMetric,
  type CustomMetric,
  defaultUnitOf,
  type ExerciseBlock,
  METRIC_LABEL_KEY,
  type MetricKey,
  MetricSource,
  metricLabel,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoPencil, IoTrashOutline } from "react-icons/io5";
import { CustomMetricForm } from "@/feature/library/component/CustomMetricForm";
import { useDeleteCustomMetric } from "@/feature/library/hook/useCustomMetrics";
import { catalogByFamily, metricHint } from "@/feature/library/util/metric-catalog.util";
import { CmvButton, CmvConfirmButton, CmvDragHandle, CmvPanel } from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";

// i18n-values exercise.metric: MetricKey
// i18n-values library.builder.family: MetricFamily

type MetricPickerProps = {
  open: boolean;
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  onChange: (block: ExerciseBlock) => void;
  onClose: () => void;
};

const FAMILIES = catalogByFamily();

/**
 * Le choix des colonnes d'un bloc. L'ordre de la liste retenue EST l'ordre des colonnes — d'où la
 * poignée de réordonnancement plutôt qu'un simple jeu de cases à cocher.
 *
 * Retirer une colonne retire AUSSI ses valeurs dans les lignes : les laisser produirait des
 * valeurs orphelines, que `validateBlockValues` signale à juste titre comme une incohérence.
 */
export function MetricPicker({
  open,
  block,
  customMetrics,
  onChange,
  onClose,
}: Readonly<MetricPickerProps>) {
  const { t } = useTranslation();
  // La métrique en cours de modification : le formulaire du dessus s'y remplit, et son bouton
  // passe de « Ajouter » à « Modifier ».
  const [editing, setEditing] = useState<CustomMetric | null>(null);
  const removeMetric = useDeleteCustomMetric();

  const chosenKeys = new Set(
    block.metrics
      .filter((metric) => metric.source === MetricSource.CATALOG)
      .map((metric) => metric.key),
  );
  const chosenCustomIds = new Set(
    block.metrics
      .filter((metric) => metric.source === MetricSource.CUSTOM)
      .map((metric) => metric.customMetricId),
  );
  const isFull = block.metrics.length >= BLOCK_MAX_METRICS;

  /** Bascule : recliquer une métrique déjà retenue la retire, comme une case à cocher. */
  function toggleCatalog(key: MetricKey) {
    const existing = block.metrics.find(
      (metric) => metric.source === MetricSource.CATALOG && metric.key === key,
    );
    if (existing != null) return remove(existing.id);
    if (isFull) return;
    const metric: BlockMetric = {
      id: crypto.randomUUID(),
      source: MetricSource.CATALOG,
      key,
      unit: defaultUnitOf(key),
      label: null,
      collapsed: false,
    };
    onChange({ ...block, metrics: [...block.metrics, metric] });
  }

  function toggleCustom(customMetricId: string) {
    const existing = block.metrics.find(
      (metric) => metric.source === MetricSource.CUSTOM && metric.customMetricId === customMetricId,
    );
    if (existing != null) return remove(existing.id);
    if (isFull) return;
    const metric: BlockMetric = {
      id: crypto.randomUUID(),
      source: MetricSource.CUSTOM,
      customMetricId,
      label: null,
      collapsed: false,
    };
    onChange({ ...block, metrics: [...block.metrics, metric] });
  }

  function remove(metricId: string) {
    // `exerciseBlockSchema` exige au moins une colonne : un bloc sans colonne ne pourrait rien
    // porter, et la grille n'aurait plus rien à afficher.
    if (block.metrics.length <= 1) return;
    onChange({
      ...block,
      metrics: block.metrics.filter((metric) => metric.id !== metricId),
      rows: block.rows.map((row) => {
        const { [metricId]: _removed, ...rest } = row.values;
        return { ...row, values: rest };
      }),
    });
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= block.metrics.length) return;
    const next = [...block.metrics];
    const [moved] = next.splice(index, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    onChange({ ...block, metrics: next });
  }

  return (
    <CmvPanel
      open={open}
      title={t("library.builder.metrics.title")}
      description={t("library.builder.metrics.orderHint")}
      onClose={onClose}
      footer={<CmvButton onClick={onClose}>{t("library.builder.metrics.done")}</CmvButton>}
    >
      <div className="flex flex-col gap-cmv-xl">
        <ChosenColumns
          block={block}
          customMetrics={customMetrics}
          onMove={move}
          onRemove={remove}
        />

        {/* Créée ICI et posée aussitôt en colonne : sortir du constructeur pour définir une
            cotation, puis y revenir, ferait perdre le fil de l'exercice en cours. */}
        <CustomMetricForm
          editing={editing}
          onCreated={(metric) => toggleCustom(metric.id)}
          onUpdated={() => setEditing(null)}
          onCancelEdit={() => setEditing(null)}
        />

        <section className="flex flex-col gap-cmv-xs">
          <span className="text-cmv-body text-cmv-text-hi">{t("library.builder.custom.mine")}</span>
          {customMetrics.length === 0 ? (
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("library.builder.custom.none")}
            </span>
          ) : null}
          {customMetrics.map((custom) => (
            <div key={custom.id} className="flex items-center gap-cmv-xs">
              <button
                type="button"
                disabled={isFull && !chosenCustomIds.has(custom.id)}
                onClick={() => toggleCustom(custom.id)}
                className="flex flex-1 items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
              >
                <Checkbox checked={chosenCustomIds.has(custom.id)} />
                <span className="text-cmv-body text-cmv-text-hi">{custom.label}</span>
                {custom.unit == null ? null : (
                  <span className="text-cmv-caption text-cmv-text-lo">{custom.unit}</span>
                )}
              </button>

              <CmvButton
                variant="ghost"
                title={t("library.builder.custom.edit")}
                onClick={() => setEditing(custom)}
              >
                <IoPencil />
              </CmvButton>
              <CmvConfirmButton
                label={t("library.builder.custom.remove")}
                icon={<IoTrashOutline />}
                confirmLabel={t("common.confirmDelete")}
                cancelLabel={t("common.cancel")}
                disabled={removeMetric.isPending}
                onConfirm={() => removeMetric.mutate(custom.id)}
              />
            </div>
          ))}
        </section>

        {[...FAMILIES].map(([family, keys]) => (
          <section key={family} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-body text-cmv-text-hi">
              {t(`library.builder.family.${family}`)}
            </span>
            {keys.map((key) => (
              <CatalogRow
                key={key}
                metricKey={key}
                chosen={chosenKeys.has(key)}
                disabled={isFull && !chosenKeys.has(key)}
                onToggle={() => toggleCatalog(key)}
              />
            ))}
          </section>
        ))}
      </div>
    </CmvPanel>
  );
}

/**
 * Une case à cocher DESSINÉE plutôt qu'un `<input type=checkbox>` : la ligne entière est déjà un
 * bouton qui bascule, et imbriquer un contrôle dans un bouton produirait deux cibles de clic
 * pour une seule intention.
 */
function Checkbox({ checked }: Readonly<{ checked: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-cmv-sm border text-cmv-caption",
        checked
          ? "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on"
          : "border-cmv-border",
      )}
    >
      {checked ? "✓" : null}
    </span>
  );
}

function CatalogRow({
  metricKey,
  chosen,
  disabled,
  onToggle,
}: Readonly<{ metricKey: MetricKey; chosen: boolean; disabled: boolean; onToggle: () => void }>) {
  const { t } = useTranslation();
  const hint = metricHint(metricKey, t);

  return (
    <button
      type="button"
      aria-pressed={chosen}
      disabled={disabled}
      onClick={onToggle}
      className="flex items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
    >
      <Checkbox checked={chosen} />
      <span className="text-cmv-body text-cmv-text-hi">{t(METRIC_LABEL_KEY[metricKey])}</span>
      {hint == null ? null : <span className="text-cmv-caption text-cmv-text-lo">{hint}</span>}
    </button>
  );
}

function ChosenColumns({
  block,
  customMetrics,
  onMove,
  onRemove,
}: Readonly<{
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  onMove: (index: number, to: number) => void;
  onRemove: (metricId: string) => void;
}>) {
  const { t } = useTranslation();
  const drag = useReorderDrag(onMove);

  return (
    <section className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.metrics.chosen")}
      </span>
      {block.metrics.map((metric, index) => (
        <div
          key={metric.id}
          {...drag.rowProps(index)}
          className={cn(
            "flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border px-cmv-sm py-cmv-xs",
            drag.isDragging(index) && "opacity-40",
            // UN seul fond : deux classes de `background-color` se départageraient à l'ordre du
            // fichier CSS, pas à l'ordre où on les écrit.
            drag.isOver(index) ? "bg-cmv-accent-soft" : "bg-cmv-surface",
          )}
        >
          <CmvDragHandle
            label={`${t("library.builder.metrics.moveColumn")} ${index + 1}`}
            {...drag.handleProps(index)}
            onMove={(direction) => onMove(index, index + direction)}
          />
          <span className="flex-1 text-cmv-body text-cmv-text-hi">
            {metricLabel(metric, customMetrics, t)}
          </span>
          <CmvButton
            variant="ghost"
            title={t("library.builder.metrics.removeColumn")}
            disabled={block.metrics.length <= 1}
            onClick={() => onRemove(metric.id)}
          >
            <IoTrashOutline />
          </CmvButton>
        </div>
      ))}
    </section>
  );
}

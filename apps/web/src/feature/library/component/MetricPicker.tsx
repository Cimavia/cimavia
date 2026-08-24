import {
  BLOCK_MAX_METRICS,
  type BlockMetric,
  type CustomMetric,
  defaultUnitOf,
  type ExerciseBlock,
  METRIC_LABEL_KEY,
  type MetricKey,
  MetricSource,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { CustomMetricForm } from "@/feature/library/component/CustomMetricForm";
import { catalogByFamily, metricHint } from "@/feature/library/util/metric-catalog.util";
import { metricLabel } from "@/feature/library/util/metric-label.util";
import { CmvButton, CmvDragHandle, CmvPanel } from "@/shared/component";

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

  function addCatalog(key: MetricKey) {
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

  function addCustom(customMetricId: string) {
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

        <section className="flex flex-col gap-cmv-xs">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("library.builder.custom.mine")}
          </span>
          {customMetrics.length === 0 ? (
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("library.builder.custom.none")}
            </span>
          ) : null}
          {customMetrics.map((custom) => (
            <button
              key={custom.id}
              type="button"
              disabled={isFull || chosenCustomIds.has(custom.id)}
              onClick={() => addCustom(custom.id)}
              className="flex items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
            >
              <span className="text-cmv-body text-cmv-text-hi">{custom.label}</span>
              {custom.unit == null ? null : (
                <span className="text-cmv-caption text-cmv-text-lo">{custom.unit}</span>
              )}
            </button>
          ))}
        </section>

        {/* Créée ICI et posée aussitôt en colonne : sortir du constructeur pour définir une
            cotation, puis y revenir, ferait perdre le fil de l'exercice en cours. */}
        <CustomMetricForm onCreated={(metric) => addCustom(metric.id)} />

        {[...FAMILIES].map(([family, keys]) => (
          <section key={family} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">
              {t(`library.builder.family.${family}`)}
            </span>
            {keys.map((key) => (
              <CatalogRow
                key={key}
                metricKey={key}
                chosen={chosenKeys.has(key)}
                disabled={isFull}
                onAdd={() => addCatalog(key)}
              />
            ))}
          </section>
        ))}
      </div>
    </CmvPanel>
  );
}

function CatalogRow({
  metricKey,
  chosen,
  disabled,
  onAdd,
}: Readonly<{ metricKey: MetricKey; chosen: boolean; disabled: boolean; onAdd: () => void }>) {
  const { t } = useTranslation();
  const hint = metricHint(metricKey, t);

  return (
    <button
      type="button"
      // Déjà retenue : le retrait passe par la liste du haut, où l'on voit ce qu'on enlève.
      disabled={chosen || disabled}
      onClick={onAdd}
      className="flex items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
    >
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.metrics.chosen")}
      </span>
      {block.metrics.map((metric, index) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: cible de dépôt du glisser-déposer — le chemin accessible est la poignée CmvDragHandle, qui répond aux flèches
        <div
          key={metric.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex != null) onMove(dragIndex, index);
            setDragIndex(null);
          }}
          className="flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border bg-cmv-surface px-cmv-sm py-cmv-xs"
        >
          <CmvDragHandle
            label={`${t("library.builder.metrics.moveColumn")} ${index + 1}`}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
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

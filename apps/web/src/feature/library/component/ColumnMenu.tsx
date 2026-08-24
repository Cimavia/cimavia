import {
  type BlockMetric,
  ColumnFillMode,
  type CustomMetric,
  canCollapseMetric,
  columnValues,
  type ExerciseBlock,
  fillColumn,
  METRIC_CATALOG,
  METRIC_UNIT_LABEL_KEY,
  MetricSource,
  type MetricUnit,
  MetricValueType,
  metricValueTypeOf,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoChevronDown } from "react-icons/io5";
import { metricLabel } from "@/feature/library/util/metric-label.util";
import { CmvButton } from "@/shared/component";

// i18n-values exercise.unit: MetricUnit

type ColumnMenuProps = {
  block: ExerciseBlock;
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  onChange: (block: ExerciseBlock) => void;
};

/**
 * Le menu d'une colonne : son unité, les remplissages en masse, et le repli en valeur commune.
 *
 * Le repli est un état d'AFFICHAGE, pas une nature de donnée : les valeurs restent dans les
 * lignes, et redéployer la colonne les retrouve intactes. C'est ce qui le rend réversible sans
 * rien perdre.
 */
export function ColumnMenu({ block, metric, customMetrics, onChange }: Readonly<ColumnMenuProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const collapsible = canCollapseMetric(block, metric.id);
  // Rien à replier quand il n'y a aucune ligne : la « valeur commune » n'aurait pas de référent,
  // et la saisir n'écrirait nulle part.
  const canFold = collapsible && block.rows.length > 0;

  function apply(next: ExerciseBlock) {
    onChange(next);
    setOpen(false);
  }

  function setUnit(unit: MetricUnit) {
    apply({
      ...block,
      metrics: block.metrics.map((current) =>
        current.id === metric.id ? { ...current, unit } : current,
      ),
    });
  }

  function setCollapsed(collapsed: boolean) {
    apply({
      ...block,
      metrics: block.metrics.map((current) =>
        current.id === metric.id ? { ...current, collapsed } : current,
      ),
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex items-center gap-cmv-xs text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
      >
        {metricLabel(metric, customMetrics, t)}
        <IoChevronDown />
      </button>

      {open ? (
        <div className="absolute z-10 mt-cmv-xs flex w-64 flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md shadow-lg">
          {metric.source === MetricSource.CATALOG ? (
            <UnitChoice metric={metric} onChange={setUnit} />
          ) : null}

          <FillActions
            block={block}
            metric={metric}
            customMetrics={customMetrics}
            onFill={(rows) => apply({ ...block, rows })}
          />

          <div className="flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-sm">
            {metric.collapsed ? (
              <CmvButton variant="ghost" onClick={() => setCollapsed(false)}>
                {t("library.builder.column.expand")}
              </CmvButton>
            ) : (
              <CmvButton variant="ghost" disabled={!canFold} onClick={() => setCollapsed(true)}>
                {t("library.builder.column.collapse")}
              </CmvButton>
            )}
            {metric.collapsed || canFold ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">
                {t("library.builder.column.cannotCollapse")}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UnitChoice({
  metric,
  onChange,
}: Readonly<{
  metric: Extract<BlockMetric, { source: "CATALOG" }>;
  onChange: (unit: MetricUnit) => void;
}>) {
  const { t } = useTranslation();
  const units = METRIC_CATALOG[metric.key].units;
  // Une seule unité admise = aucun choix à offrir. Un select à une option est du bruit.
  if (units.length < 2) return null;

  return (
    <label className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">{t("library.builder.column.unit")}</span>
      <select
        value={metric.unit}
        onChange={(event) => onChange(event.target.value as MetricUnit)}
        className="rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
      >
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {t(METRIC_UNIT_LABEL_KEY[unit])}
          </option>
        ))}
      </select>
    </label>
  );
}

type FillActionsProps = {
  block: ExerciseBlock;
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  onFill: (rows: ExerciseBlock["rows"]) => void;
};

/**
 * Les remplissages en masse. Tous partent de la PREMIÈRE ligne : le coach saisit une valeur, puis
 * dit comment la suite s'en déduit. Demander un point de départ dans le menu dupliquerait une
 * information qui est déjà à l'écran.
 */
function FillActions({ block, metric, customMetrics, onFill }: Readonly<FillActionsProps>) {
  const { t } = useTranslation();
  const [step, setStep] = useState("2");

  const values = columnValues(block, metric.id);
  const first = values[0] ?? null;
  const valueType = metricValueTypeOf(metric, customMetrics);
  const scale =
    metric.source === MetricSource.CUSTOM
      ? (customMetrics.find((custom) => custom.id === metric.customMetricId)?.scale ?? null)
      : null;

  const parsedStep = Number.parseInt(step, 10);
  const stepIsUsable = Number.isFinite(parsedStep) && parsedStep !== 0;

  if (block.rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">{t("library.builder.column.fill")}</span>

      <CmvButton
        variant="ghost"
        onClick={() =>
          onFill(fillColumn(block, metric.id, { mode: ColumnFillMode.SAME, value: first }))
        }
      >
        {t("library.builder.column.fillSame")}
      </CmvButton>

      <CmvButton
        variant="ghost"
        onClick={() => onFill(fillColumn(block, metric.id, { mode: ColumnFillMode.MIRROR }))}
      >
        {t("library.builder.column.fillMirror")}
      </CmvButton>

      <div className="flex items-center gap-cmv-xs">
        <input
          value={step}
          inputMode="numeric"
          aria-label={t("library.builder.column.stepLabel")}
          onChange={(event) => setStep(event.target.value)}
          className="w-14 rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
        />
        {valueType === MetricValueType.SCALE ? (
          <CmvButton
            variant="ghost"
            disabled={!stepIsUsable || scale == null || typeof first !== "string"}
            onClick={() => {
              if (scale == null || typeof first !== "string") return;
              onFill(
                fillColumn(block, metric.id, {
                  mode: ColumnFillMode.SCALE_STEP,
                  scale,
                  start: first,
                  step: parsedStep,
                }),
              );
            }}
          >
            {t("library.builder.column.fillScaleStep")}
          </CmvButton>
        ) : (
          <CmvButton
            variant="ghost"
            disabled={!stepIsUsable || typeof first !== "number"}
            onClick={() => {
              if (typeof first !== "number") return;
              onFill(
                fillColumn(block, metric.id, {
                  mode: ColumnFillMode.STEP,
                  start: first,
                  step: parsedStep,
                }),
              );
            }}
          >
            {t("library.builder.column.fillStep")}
          </CmvButton>
        )}
      </div>
    </div>
  );
}

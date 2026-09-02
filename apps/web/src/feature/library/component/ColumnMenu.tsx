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
  metricLabel,
  metricValueTypeOf,
  scaleFor,
} from "@cmv/shared";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoChevronDown } from "react-icons/io5";
import { CMV_TABLE, CmvButton } from "@/shared/component";
import { useAnchoredPosition } from "@/shared/hook/useAnchoredPosition";
import { cn } from "@/shared/util/cn.util";

// i18n-values exercise.unit: MetricUnit

type ColumnMenuProps = {
  block: ExerciseBlock;
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  /** Id de la colonne dont le menu est ouvert — un seul à la fois, d'où l'état chez le parent. */
  openMetricId: string | null;
  onOpenChange: (metricId: string | null) => void;
  onChange: (block: ExerciseBlock) => void;
};

/**
 * Le menu d'une colonne : son unité, les remplissages en masse, et le repli en valeur commune.
 *
 * Le repli est un état d'AFFICHAGE, pas une nature de donnée : les valeurs restent dans les
 * lignes, et redéployer la colonne les retrouve intactes. C'est ce qui le rend réversible sans
 * rien perdre.
 */
export function ColumnMenu({
  block,
  metric,
  customMetrics,
  openMetricId,
  onOpenChange,
  onChange,
}: Readonly<ColumnMenuProps>) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = openMetricId === metric.id;
  const position = useAnchoredPosition(triggerRef, open);
  const setOpen = (next: boolean) => onOpenChange(next ? metric.id : null);

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
    <div>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(CMV_TABLE.headLabel, "flex items-center gap-cmv-xs hover:text-cmv-text-hi")}
      >
        {metricLabel(metric, customMetrics, t)}
        <IoChevronDown />
      </button>

      {/*
        Positionné en `fixed` d'après le bouton, et non en `absolute` : la grille défile
        horizontalement (`overflow-x-auto`), ce qui ROGNE tout enfant qui déborde — le menu
        disparaissait dès que le tableau avait peu de lignes.
      */}
      {open ? (
        <div
          style={position}
          className="fixed z-20 flex w-64 flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md shadow-lg"
        >
          {metric.source === MetricSource.CATALOG ? (
            <UnitChoice metric={metric} onChange={setUnit} />
          ) : null}

          <FillActions
            block={block}
            metric={metric}
            customMetrics={customMetrics}
            onFill={(rows) => apply({ ...block, rows })}
          />

          {/* Sans ligne, il n'y a rien à replier ET rien à contredire : afficher « la valeur
              change d'une ligne à l'autre » serait faux, puisqu'il n'y a pas de ligne. Le
              message de remplissage dit déjà ce qui manque. */}
          {block.rows.length === 0 ? null : (
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
          )}
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
  const scale = scaleFor(metric, customMetrics);

  const parsedStep = Number.parseInt(step, 10);
  const stepIsUsable = Number.isFinite(parsedStep) && parsedStep !== 0;

  // Sans ligne, aucun remplissage n'a de sens — mais un menu à moitié vide se lit comme un bug.
  // On dit ce qui manque plutôt que de ne rien montrer.
  if (block.rows.length === 0) {
    return (
      <p className="border-cmv-border border-t pt-cmv-sm text-cmv-caption text-cmv-text-lo">
        {t("library.builder.column.needsRow")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-cmv-xs border-cmv-border text-left">
      <span className="text-cmv-caption text-cmv-text-mid">{t("library.builder.column.fill")}</span>

      {/* Indentés sous leur titre : la hiérarchie se lit à l'alignement, pas à la taille. */}
      <div className="flex flex-col items-start gap-cmv-xs pl-cmv-sm">
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
    </div>
  );
}

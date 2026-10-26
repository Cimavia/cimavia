import {
  type BlockMetric,
  ColumnFillMode,
  type ColumnFillPlan,
  type CustomMetric,
  canCollapseMetric,
  columnValues,
  type ExerciseBlock,
  fillableRows,
  fillColumn,
  type GridMetric,
  MetricSource,
  type MetricUnit,
  type MetricValue,
  MetricValueType,
  metricLabel,
  metricValueTypeOf,
  parseDecimal,
  scaleFor,
} from "@cmv/shared";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoChevronDown } from "react-icons/io5";
import { UnitChoice } from "@/feature/library/component/UnitChoice";
import { CMV_EDIT, CMV_TABLE, CmvButton } from "@/shared/component";
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
  const collapsible = canCollapseMetric(block, metric.id);
  // Rien à replier quand il n'y a aucune ligne : la « valeur commune » n'aurait pas de référent,
  // et la saisir n'écrirait nulle part.
  const canFold = collapsible && block.rows.length > 0;
  const setOpen = (next: boolean) => onOpenChange(next ? metric.id : null);

  function apply(next: ExerciseBlock) {
    onChange(next);
    setOpen(false);
  }

  function setMetric(change: Partial<BlockMetric>) {
    apply({
      ...block,
      metrics: block.metrics.map((current) =>
        current.id === metric.id ? ({ ...current, ...change } as BlockMetric) : current,
      ),
    });
  }

  return (
    <ColumnPopover
      metric={metric}
      customMetrics={customMetrics}
      open={openMetricId === metric.id}
      onOpenChange={setOpen}
      firstValue={columnValues(block, metric.id)[0] ?? null}
      hasRows={block.rows.length > 0}
      onUnit={(unit) => setMetric({ unit })}
      // En Séries, le remplissage couvre les N séries — fantômes compris : la grille les affiche,
      // et « 8 · 10 · 12 · 14 » qui s'arrêterait à la deuxième ligne mentirait sur ce qu'elle montre.
      onFill={(plan) =>
        apply({
          ...block,
          rows: fillColumn(
            { ...block, rows: fillableRows(block, () => crypto.randomUUID()) },
            metric.id,
            plan,
          ),
        })
      }
    >
      {/* Sans ligne, il n'y a rien à replier ET rien à contredire : afficher « la valeur
          change d'une ligne à l'autre » serait faux, puisqu'il n'y a pas de ligne. Le
          message de remplissage dit déjà ce qui manque. */}
      {block.rows.length === 0 ? null : (
        <div className="flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-sm">
          {metric.collapsed ? (
            <CmvButton variant="ghost" onClick={() => setMetric({ collapsed: false })}>
              {t("library.builder.column.expand")}
            </CmvButton>
          ) : (
            <CmvButton
              variant="ghost"
              disabled={!canFold}
              onClick={() => setMetric({ collapsed: true })}
            >
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
    </ColumnPopover>
  );
}

type ColumnPopoverProps = {
  metric: GridMetric;
  customMetrics: readonly CustomMetric[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La valeur de la première ligne, d'où partent les remplissages ; `null` sans valeur. */
  firstValue: MetricValue;
  hasRows: boolean;
  onUnit: (unit: MetricUnit) => void;
  onFill: (plan: ColumnFillPlan) => void;
  /** Ce que la grille ajoute au menu : le repli de l'ancienne, le retrait de la colonne. */
  children?: ReactNode;
};

/**
 * Le menu d'une colonne, commun aux deux grilles : son libellé en bouton, puis l'unité et les
 * remplissages en masse. Chaque grille dit comment s'écrit un remplissage — l'ancienne sur ses
 * séries, celle d'un exercice de bloc sur ses tours.
 */
export function ColumnPopover({
  metric,
  customMetrics,
  open,
  onOpenChange,
  firstValue,
  hasRows,
  onUnit,
  onFill,
  children,
}: Readonly<ColumnPopoverProps>) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPosition(triggerRef, open);

  return (
    <div>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={cn(CMV_TABLE.headLabel, "flex items-center gap-cmv-xs hover:text-cmv-text-hi")}
      >
        {metricLabel(metric, customMetrics, t)}
        <IoChevronDown className={CMV_EDIT.only} />
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
            <UnitChoice
              metric={metric}
              label={t("library.builder.column.unit")}
              onChange={onUnit}
            />
          ) : null}

          <FillActions
            first={firstValue}
            hasRows={hasRows}
            metric={metric}
            customMetrics={customMetrics}
            onFill={onFill}
          />
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Le pas proposé à l'ouverture du menu : « 8 · 10 · 12 · 14 » est la progression la plus courante. */
const DEFAULT_FILL_STEP = "2";

/**
 * Le pas tapé, ou `null` s'il ne peut servir. Décimal sur une colonne de nombres — « +2,5 kg » est
 * un pas courant (#332) — mais ENTIER sur une échelle : on avance d'un palier ou de deux, pas d'un
 * palier et demi. Un pas nul ne remplirait rien d'autre qu'une colonne identique, ce que fait déjà
 * « Même valeur partout ».
 */
function usableStep(text: string, valueType: MetricValueType | null): number | null {
  const step = parseDecimal(text);
  if (step == null || step === 0) return null;
  if (valueType === MetricValueType.SCALE && !Number.isInteger(step)) return null;
  return step;
}

type FillActionsProps = {
  first: MetricValue;
  hasRows: boolean;
  metric: GridMetric;
  customMetrics: readonly CustomMetric[];
  onFill: (plan: ColumnFillPlan) => void;
};

/**
 * Les remplissages en masse. Tous partent de la PREMIÈRE ligne : le coach saisit une valeur, puis
 * dit comment la suite s'en déduit. Demander un point de départ dans le menu dupliquerait une
 * information qui est déjà à l'écran.
 */
function FillActions({
  first,
  hasRows,
  metric,
  customMetrics,
  onFill,
}: Readonly<FillActionsProps>) {
  const { t } = useTranslation();
  const [step, setStep] = useState(DEFAULT_FILL_STEP);

  const valueType = metricValueTypeOf(metric, customMetrics);
  const scale = scaleFor(metric, customMetrics);

  const parsedStep = usableStep(step, valueType);

  /**
   * Les deux progressions, prêtes à jouer — ou `null` tant qu'il leur manque un pas lisible ou un
   * départ du bon type. Calculées UNE fois pour le bouton et son geste : le bouton est fermé sur
   * `null`, et le geste n'a donc rien à re-vérifier (#512).
   */
  const scaleStepPlan: ColumnFillPlan | null =
    parsedStep != null && scale != null && typeof first === "string"
      ? { mode: ColumnFillMode.SCALE_STEP, scale, start: first, step: parsedStep }
      : null;
  const stepPlan: ColumnFillPlan | null =
    parsedStep != null && typeof first === "number"
      ? { mode: ColumnFillMode.STEP, start: first, step: parsedStep }
      : null;
  const fillWith = (plan: ColumnFillPlan | null) => (plan == null ? undefined : () => onFill(plan));

  // Sans ligne, aucun remplissage n'a de sens — mais un menu à moitié vide se lit comme un bug.
  // On dit ce qui manque plutôt que de ne rien montrer.
  if (!hasRows) {
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
          onClick={() => onFill({ mode: ColumnFillMode.SAME, value: first })}
        >
          {t("library.builder.column.fillSame")}
        </CmvButton>

        <CmvButton variant="ghost" onClick={() => onFill({ mode: ColumnFillMode.MIRROR })}>
          {t("library.builder.column.fillMirror")}
        </CmvButton>

        <div className="flex items-center gap-cmv-xs">
          <input
            value={step}
            inputMode={valueType === MetricValueType.SCALE ? "numeric" : "decimal"}
            aria-label={t("library.builder.column.stepLabel")}
            onChange={(event) => setStep(event.target.value)}
            className="w-14 rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
          />
          {valueType === MetricValueType.SCALE ? (
            <CmvButton
              variant="ghost"
              disabled={scaleStepPlan == null}
              onClick={fillWith(scaleStepPlan)}
            >
              {t("library.builder.column.fillScaleStep")}
            </CmvButton>
          ) : (
            <CmvButton variant="ghost" disabled={stepPlan == null} onClick={fillWith(stepPlan)}>
              {t("library.builder.column.fillStep")}
            </CmvButton>
          )}
        </div>
      </div>
    </div>
  );
}

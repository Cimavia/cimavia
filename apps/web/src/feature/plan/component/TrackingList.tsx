import {
  type BlockTrackingState,
  type CustomMetric,
  type ExerciseBlock,
  rowForUnit,
  TrackingMode,
  trackingUnits,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { metricCellText } from "@/feature/library/util/metric-label.util";
import { CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

// i18n-values plan.tracking.unit: TrackingUnit

type TrackingListProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  state: BlockTrackingState | undefined;
  onToggle: (index: number) => void;
  onRounds: (rounds: number) => void;
  /** Séance débriefée : les cases restent CONSULTABLES mais ne se modifient plus. */
  frozen: boolean;
};

/**
 * Les cases d'un bloc, **toujours affichées**.
 *
 * Le mobile les ouvre par un lien parce que la place n'y est pas ; sur grand écran elles tiennent
 * d'emblée, et une bascule de plus n'apporterait qu'un clic.
 */
export function TrackingList({
  block,
  customMetrics,
  state,
  onToggle,
  onRounds,
  frozen,
}: Readonly<TrackingListProps>) {
  const { t } = useTranslation();
  const units = trackingUnits(block);
  if (units == null) return null;

  if (units.mode === TrackingMode.COUNT) {
    const rounds = state != null && "rounds" in state ? state.rounds : 0;
    return (
      <div className="flex items-center gap-cmv-md">
        <CmvButton
          variant="secondary"
          disabled={frozen || rounds === 0}
          onClick={() => onRounds(rounds - 1)}
        >
          −
        </CmvButton>
        <span className="font-cmv-display text-cmv-display text-cmv-text-hi">{rounds}</span>
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("plan.tracking.rounds", { count: rounds })}
        </span>
        <CmvButton variant="secondary" disabled={frozen} onClick={() => onRounds(rounds + 1)}>
          +
        </CmvButton>
      </div>
    );
  }

  const checked = state != null && "checked" in state ? state.checked : [];

  return (
    <div className="flex flex-wrap gap-cmv-xs">
      {Array.from({ length: units.count }, (_, index) => {
        const isChecked = checked.includes(index);
        const row = rowForUnit(block, index);
        // Chaque case RAPPELLE le dosage de sa ligne — « 8 répétitions · 6a » — sinon il faudrait
        // remonter à la grille pour savoir ce qu'on coche. Les valeurs absentes sont sautées :
        // une case n'a pas la place d'aligner des tirets.
        const detail =
          row == null
            ? ""
            : block.metrics
                .filter((metric) => row.values[metric.id] != null)
                .map((metric) =>
                  metricCellText(row.values[metric.id] ?? null, metric, customMetrics, t),
                )
                .join(" · ");

        return (
          <button
            key={index}
            type="button"
            aria-pressed={isChecked}
            disabled={frozen}
            onClick={() => onToggle(index)}
            title={detail}
            className={cn(
              "flex items-center gap-cmv-xs rounded-cmv-md border px-cmv-md py-cmv-sm text-cmv-caption",
              isChecked
                ? "border-cmv-success-line bg-cmv-success-soft text-cmv-success-on"
                : "border-cmv-border bg-cmv-surface text-cmv-text-mid",
              // Séance débriefée : ni curseur pointeur, ni survol — le suivi se consulte, il ne
              // s'édite plus.
              frozen ? "cursor-default" : "hover:border-cmv-border-hi",
            )}
          >
            <span aria-hidden="true">{isChecked ? "✓" : "○"}</span>
            {t(`plan.tracking.unit.${units.unit}`, { index: index + 1 })}
          </button>
        );
      })}
    </div>
  );
}

import {
  type BlockTrackingState,
  type CustomMetric,
  type ExerciseBlock,
  rowForUnit,
  TrackingMode,
  trackingUnits,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { cellText } from "@/feature/plan/component/DosageBlock";
import { CmvText } from "@/shared/component";

// i18n-values plan.tracking.unit: TrackingUnit

type TrackingListProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  state: BlockTrackingState | undefined;
  onToggle: (index: number) => void;
  onRounds: (rounds: number) => void;
  /** Séance déjà débriefée : le suivi reste consultable, il ne se modifie plus. */
  frozen: boolean;
};

/**
 * Les cases d'un bloc — ou son compteur, pour un AMRAP.
 *
 * La granularité n'est PAS celle du coach : « ×4 séries » n'a qu'une ligne de grille mais quatre
 * cases. Chaque case rappelle le dosage de sa ligne, sinon l'athlète devrait remonter à la grille
 * pour savoir ce qu'il coche.
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
    return <RoundCounter rounds={rounds} frozen={frozen} onRounds={onRounds} />;
  }

  const checked = state != null && "checked" in state ? state.checked : [];

  return (
    <View className="gap-2">
      {Array.from({ length: units.count }, (_, index) => (
        <UnitRow
          key={index}
          label={t(`plan.tracking.unit.${units.unit}`, { index: index + 1 })}
          detail={unitDetail(block, index, customMetrics, t)}
          checked={checked.includes(index)}
          frozen={frozen}
          onPress={() => onToggle(index)}
        />
      ))}
    </View>
  );
}

/**
 * Chaque case RAPPELLE le dosage de sa ligne — « 8 répétitions · 6a » — sinon il faudrait remonter
 * à la grille pour savoir ce qu'on coche. Les valeurs absentes sont sautées : une case n'a pas la
 * place d'aligner des tirets.
 */
function unitDetail(
  block: ExerciseBlock,
  index: number,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string {
  const row = rowForUnit(block, index);
  if (row == null) return "";
  return block.metrics
    .filter((metric) => row.values[metric.id] != null)
    .map((metric) => cellText(row.values[metric.id] ?? null, metric, customMetrics, t))
    .join(" · ");
}

function UnitRow({
  label,
  detail,
  checked,
  frozen,
  onPress,
}: Readonly<{
  label: string;
  detail: string;
  checked: boolean;
  frozen: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={frozen ? undefined : onPress}
      disabled={frozen}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: frozen }}
      // 44 px de haut : c'est le minimum tactile, et une case ratée en pleine série agace plus
      // qu'elle ne coûte de place.
      className={`min-h-11 flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
        checked ? "border-cmv-success-line bg-cmv-success-soft" : "border-cmv-border bg-cmv-surface"
      }`}
    >
      <View
        className={`size-6 items-center justify-center rounded-md border ${
          checked ? "border-cmv-success-line bg-cmv-success-soft" : "border-cmv-border"
        }`}
      >
        {checked ? <CmvText className="text-cmv-success-on text-xs">✓</CmvText> : null}
      </View>
      <CmvText className="text-cmv-text-hi">{label}</CmvText>
      {detail === "" ? null : (
        <CmvText className="flex-1 text-cmv-text-mid text-xs">{detail}</CmvText>
      )}
    </Pressable>
  );
}

/**
 * L'AMRAP se COMPTE. L'objectif du coach est indicatif : rien ici ne dit « il en manque trois »,
 * et le compteur n'a pas de plafond.
 */
function RoundCounter({
  rounds,
  frozen,
  onRounds,
}: Readonly<{ rounds: number; frozen: boolean; onRounds: (rounds: number) => void }>) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center gap-4">
      <Pressable
        onPress={frozen ? undefined : () => onRounds(rounds - 1)}
        disabled={frozen || rounds === 0}
        hitSlop={8}
        accessibilityLabel={t("plan.tracking.roundsMinus")}
        className="size-11 items-center justify-center rounded-lg border border-cmv-border"
      >
        <CmvText className="text-cmv-text-hi">−</CmvText>
      </Pressable>

      <View className="items-center">
        <CmvText className="font-cmv-display text-cmv-text-hi text-4xl">{String(rounds)}</CmvText>
        <CmvText className="text-cmv-text-mid text-xs">
          {t("plan.tracking.rounds", { count: rounds })}
        </CmvText>
      </View>

      <Pressable
        onPress={frozen ? undefined : () => onRounds(rounds + 1)}
        disabled={frozen}
        hitSlop={8}
        accessibilityLabel={t("plan.tracking.roundsPlus")}
        className="size-11 items-center justify-center rounded-lg border border-cmv-border"
      >
        <CmvText className="text-cmv-text-hi">+</CmvText>
      </Pressable>
    </View>
  );
}

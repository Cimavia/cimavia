import { type BlockSegment, formatTrainingDuration } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";

// i18n-values plan.timer.segment: SegmentKind

const ADD_SECONDS = 30;

type TimerOverlayProps = {
  title: string;
  current: BlockSegment;
  remaining: number;
  total: number;
  totalRemaining: number;
  /** Où on en est du déroulé — « segment 4 sur 11 ». */
  position: string;
  isPaused: boolean;
  armed: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAdd: () => void;
  onStop: () => void;
  onReduce: () => void;
};

/**
 * Le chrono EN GRAND (maquette 3b / 4).
 *
 * Le bandeau réduit sert à relire la consigne pendant le repos ; celui-ci sert à l'inverse — être
 * lisible à deux mètres, téléphone posé, pendant l'effort. D'où le chiffre en `cmv-chrono` et des
 * cibles larges : on le pilote avec les mains prises.
 *
 * Un CALQUE et non une route : on revient d'un tap sur la séance qu'on n'a jamais quittée, et le
 * déroulé continue derrière. Une navigation démonterait l'écran et perdrait le défilement.
 */
export function TimerOverlay({
  title,
  current,
  remaining,
  total,
  totalRemaining,
  position,
  isPaused,
  armed,
  onPause,
  onResume,
  onSkip,
  onAdd,
  onStop,
  onReduce,
}: Readonly<TimerOverlayProps>) {
  const { t } = useTranslation();
  // La barre montre le temps RESTANT : elle se vide, elle ne se remplit pas.
  const ratio = total === 0 ? 0 : Math.max(0, Math.min(1, remaining / total));

  return (
    <View className="absolute inset-0 gap-6 bg-cmv-bg-0 p-6">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <CmvText className="text-cmv-text-hi text-lg" numberOfLines={2}>
            {title}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-sm">{position}</CmvText>
        </View>
        <Pressable
          onPress={onReduce}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("plan.timer.reduce")}
          className="size-11 items-center justify-center rounded-lg border border-cmv-border"
        >
          <CmvText className="text-cmv-text-mid">⌄</CmvText>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center gap-3">
        <CmvText className="text-cmv-accent text-sm uppercase">
          {t(`plan.timer.segment.${current.kind}`)}
        </CmvText>
        <CmvText className="font-cmv-display text-cmv-chrono text-cmv-text-hi">
          {formatTrainingDuration(remaining) ?? "0 s"}
        </CmvText>
        <CmvText className="text-cmv-text-mid text-sm">
          {t("plan.timer.outOf", { total: formatTrainingDuration(total) ?? "—" })}
        </CmvText>

        <View className="h-1 w-full overflow-hidden rounded-full bg-cmv-surface">
          <View className="h-full bg-cmv-accent" style={{ width: `${ratio * 100}%` }} />
        </View>

        {/* Le reste du déroulé, pas seulement du segment : c'est ce qui dit s'il faut tenir. */}
        <CmvText className="text-cmv-text-lo text-xs">
          {t("plan.timer.totalRemaining", {
            duration: formatTrainingDuration(totalRemaining) ?? "—",
          })}
        </CmvText>

        {armed ? null : (
          <CmvText className="text-cmv-text-lo text-xs">{t("plan.timer.notArmed")}</CmvText>
        )}
      </View>

      <View className="gap-3">
        <View className="flex-row gap-3">
          <Action
            label={t(isPaused ? "plan.timer.resume" : "plan.timer.pause")}
            onPress={isPaused ? onResume : onPause}
            primary
          />
          <Action label={t("plan.timer.add", { seconds: ADD_SECONDS })} onPress={onAdd} />
        </View>
        <View className="flex-row gap-3">
          <Action label={t("plan.timer.skipSegment")} onPress={onSkip} />
          <Action label={t("plan.timer.stop")} onPress={onStop} />
        </View>
      </View>
    </View>
  );
}

function Action({
  label,
  onPress,
  primary = false,
}: Readonly<{ label: string; onPress: () => void; primary?: boolean }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`min-h-14 flex-1 items-center justify-center rounded-lg border px-3 ${
        primary ? "border-cmv-accent-line bg-cmv-accent-soft" : "border-cmv-border"
      }`}
    >
      <CmvText className={primary ? "text-cmv-accent-on" : "text-cmv-text-mid"}>{label}</CmvText>
    </Pressable>
  );
}

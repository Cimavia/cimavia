import { type BlockSegment, type CustomMetric, type ExerciseBlock, SegmentKind } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RunnerBody } from "@/feature/plan/component/RunnerBody";
import { CmvText } from "@/shared/component";

// i18n-values plan.timer.segment: SegmentKind

const ADD_SECONDS = 30;

type TimerOverlayProps = {
  title: string;
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  current: BlockSegment;
  remaining: number;
  total: number;
  totalRemaining: number;
  /** Où on en est du déroulé — « segment 4 sur 11 ». */
  position: string;
  isPaused: boolean;
  armed: boolean;
  /** Les unités déjà cochées, et les tours comptés — la frise d'un EMOM, le compteur d'un AMRAP. */
  checked: readonly number[];
  rounds: number;
  /** Le geste qui clôt un segment manuel et lance le repos. */
  onConfirm: () => void;
  /** « Top fait » : coche l'unité SANS toucher au chrono — la minute tombe toute seule. */
  onUnitDone: () => void;
  /** « Tour fait » : l'AMRAP se compte, et son compteur n'a pas de plafond. */
  onRoundDone: () => void;
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
  block,
  customMetrics,
  current,
  remaining,
  total,
  totalRemaining,
  position,
  isPaused,
  armed,
  checked,
  rounds,
  onConfirm,
  onUnitDone,
  onRoundDone,
  onPause,
  onResume,
  onSkip,
  onAdd,
  onStop,
  onReduce,
}: Readonly<TimerOverlayProps>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const awaiting = current.kind === SegmentKind.MANUAL;

  return (
    // Les encoches s'AJOUTENT aux marges : sur un écran sans encoche, le calque garderait sinon
    // son titre collé au bord et ses boutons au ras du geste système.
    <View
      className="absolute inset-0 gap-6 bg-cmv-bg-0 px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
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
        <RunnerBody
          block={block}
          customMetrics={customMetrics}
          current={current}
          remaining={remaining}
          total={total}
          totalRemaining={totalRemaining}
          checked={checked}
          rounds={rounds}
        />

        {armed ? null : (
          <CmvText className="text-cmv-text-lo text-xs">{t("plan.timer.notArmed")}</CmvText>
        )}
      </View>

      <View className="gap-3">
        {/* Le geste PROPRE au segment, quand il y en a un. Un EMOM ne se met pas en pause pour
            valider un top — la minute tombe de toute façon ; il se coche. */}
        {primaryAction(current, t, onConfirm, onUnitDone, onRoundDone)}

        {awaiting ? null : (
          <View className="flex-row gap-3">
            <Action
              label={t(isPaused ? "plan.timer.resume" : "plan.timer.pause")}
              onPress={isPaused ? onResume : onPause}
            />
            <Action label={t("plan.timer.add", { seconds: ADD_SECONDS })} onPress={onAdd} />
          </View>
        )}
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

/**
 * Le bouton principal, s'il y en a un — et il n'y en a pas toujours.
 *
 * Enveloppé dans une RANGÉE : enfant direct d'une colonne, le `flex-1` d'`Action` s'appliquerait à
 * la hauteur et étirerait le bouton sur toute la place libre, au lieu de tenir la même ligne de
 * 56 px que « Passer » et « Arrêter ».
 */
function primaryAction(
  current: BlockSegment,
  t: TFunction,
  onConfirm: () => void,
  onUnitDone: () => void,
  onRoundDone: () => void,
) {
  const action =
    current.kind === SegmentKind.MANUAL
      ? { label: t("plan.timer.confirm"), onPress: onConfirm }
      : current.kind === SegmentKind.INTERVAL
        ? { label: t("plan.timer.topDone"), onPress: onUnitDone }
        : current.kind === SegmentKind.COUNTDOWN
          ? { label: t("plan.timer.roundDone"), onPress: onRoundDone }
          : null;
  if (action === null) return null;

  return (
    <View className="flex-row">
      <Action label={action.label} onPress={action.onPress} primary />
    </View>
  );
}

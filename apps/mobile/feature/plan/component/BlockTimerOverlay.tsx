import {
  clockCounter,
  formatTrainingDuration,
  type ReadBlock,
  type RunStep,
  RunStepKind,
  settingsPhrase,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlockMark } from "@/feature/plan/component/BlockCard";
import { StepExercises } from "@/feature/plan/component/StepExercises";
import { CmvBadge, CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

// i18n-values plan.clock.title: RunStepKind

const ADD_SECONDS = 30;

type BlockTimerOverlayProps = {
  read: ReadBlock;
  step: RunStep;
  remaining: number;
  total: number;
  isPaused: boolean;
  armed: boolean;
  onConfirm: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAdd: (seconds: number) => void;
  onStop: () => void;
};

/**
 * Le chrono d'un bloc (#722, frame 4), en grand : lisible à deux mètres, téléphone posé. Il aide
 * l'athlète et rien de plus — il ne coche aucune case, et rien n'est enregistré à l'arrêt (*Tranché
 * en #722*). Un calque sur l'écran du bloc : « Mon suivi » est juste dessous quand on le referme.
 *
 * Six formes pour un seul écran : un repos, un bip, un effort et un compte à rebours se lisent sur
 * ce qui reste ; une limite sur ce qui est écoulé ; un exercice sans durée attend « J'ai fini ».
 */
export function BlockTimerOverlay({
  read,
  step,
  remaining,
  total,
  isPaused,
  armed,
  onConfirm,
  onPause,
  onResume,
  onSkip,
  onAdd,
  onStop,
}: Readonly<BlockTimerOverlayProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const insets = useSafeAreaInsets();
  const { block, number, names } = read;
  const count = read.exercises.length;
  const phrase = settingsPhrase(block.settings, count, names);
  const counter = clockCounter(block.settings, count, step.index, names);
  const awaiting = step.kind === RunStepKind.DO;

  return (
    // Les encoches s'AJOUTENT aux marges, comme sur le chrono d'un exercice.
    <View
      className="absolute inset-0 gap-6 bg-cmv-bg-0 px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <BlockMark number={number} label={block.label} />
          <CmvBadge label={block.name} />
        </View>
        {phrase == null ? null : (
          <CmvText className="text-cmv-text-mid text-sm">{text(phrase)}</CmvText>
        )}
      </View>

      <View className="flex-1 items-center justify-center gap-3">
        <CmvText className="font-cmv-display text-2xl text-cmv-accent uppercase tracking-wide">
          {t(`plan.clock.title.${step.kind}`)}
        </CmvText>
        {awaiting ? null : <ClockFace step={step} remaining={remaining} total={total} />}
        {counter == null ? null : (
          <CmvText className="text-cmv-text-mid text-sm">{text([counter])}</CmvText>
        )}
        <StepExercises read={read} step={step} />
        {armed || awaiting ? null : (
          <CmvText className="text-cmv-text-lo text-xs">{t("plan.timer.notArmed")}</CmvText>
        )}
      </View>

      <View className="gap-3">
        {awaiting ? (
          <View className="flex-row">
            <Action label={t("plan.clock.done")} onPress={onConfirm} primary />
          </View>
        ) : (
          <View className="flex-row gap-3">
            <Action
              label={t(isPaused ? "plan.timer.resume" : "plan.timer.pause")}
              onPress={isPaused ? onResume : onPause}
            />
            <Action
              label={t("plan.timer.add", { seconds: ADD_SECONDS })}
              onPress={() => onAdd(ADD_SECONDS)}
            />
          </View>
        )}
        <View className="flex-row gap-3">
          <Action label={t("plan.timer.skip")} onPress={onSkip} />
          <Action label={t("plan.timer.stop")} onPress={onStop} />
        </View>
        <CmvText className="text-center text-cmv-text-lo text-xs">
          {t("plan.clock.ownPace")}
        </CmvText>
      </View>
    </View>
  );
}

/**
 * Le gros chiffre, sa légende et sa barre. Une limite se lit sur le temps ÉCOULÉ — « 6'21, limite
 * 15 min » — quand tout le reste se lit sur ce qui reste.
 */
function ClockFace({
  step,
  remaining,
  total,
}: Readonly<{ step: RunStep; remaining: number; total: number }>) {
  const { t } = useTranslation();
  const up = step.kind === RunStepKind.UP;
  const shown = up ? total - remaining : remaining;
  const duration = formatTrainingDuration(total);

  return (
    <>
      <CmvText className="font-cmv-display text-cmv-chrono text-cmv-text-hi">
        {formatTrainingDuration(shown)}
      </CmvText>
      <CmvText className="text-cmv-text-mid text-sm">
        {up ? t("plan.clock.limit", { duration }) : t("plan.clock.outOf", { duration })}
      </CmvText>
      <View className="h-1 w-full overflow-hidden rounded-full bg-cmv-surface">
        <View
          className="h-full bg-cmv-accent"
          style={{ width: `${total === 0 ? 0 : (shown / total) * 100}%` }}
        />
      </View>
    </>
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

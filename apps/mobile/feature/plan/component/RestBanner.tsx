import { formatTrainingDuration } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";

type RestBannerProps = {
  remaining: number;
  total: number;
  label: string;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAdd: () => void;
};

const ADD_SECONDS = 30;

/**
 * Le repos en BANDEAU, pas en plein écran.
 *
 * C'est le moment où l'athlète relit la consigne suivante : un chronomètre plein écran lui
 * cacherait exactement ce qu'il vient chercher. Le bandeau porte le temps, la pause et « Passer » ;
 * « + 30 s » y tient aussi, le reste vivrait dans un agrandi qui n'existe pas encore.
 */
export function RestBanner({
  remaining,
  total,
  label,
  isPaused,
  onPause,
  onResume,
  onSkip,
  onAdd,
}: Readonly<RestBannerProps>) {
  const { t } = useTranslation();
  // La barre montre le temps RESTANT : elle se vide, elle ne se remplit pas.
  const ratio = total === 0 ? 0 : Math.max(0, Math.min(1, remaining / total));

  return (
    <View className="absolute inset-x-0 bottom-0 gap-2 border-cmv-border border-t bg-cmv-bg-1 p-3">
      <View className="h-1 overflow-hidden rounded-full bg-cmv-surface">
        <View className="h-full bg-cmv-accent" style={{ width: `${ratio * 100}%` }} />
      </View>

      <View className="flex-row items-center gap-3">
        <CmvText className="font-cmv-mono text-cmv-text-hi text-2xl">
          {formatTrainingDuration(remaining) ?? "0 s"}
        </CmvText>
        {/* Tronqué plutôt que replié : « repos · série 3 sur 4 » déborde sur les petits écrans,
            et couper la fin vaut mieux que pousser les boutons hors de portée. */}
        <CmvText className="flex-1 text-cmv-text-mid text-xs" numberOfLines={1}>
          {label}
        </CmvText>

        <Pressable
          onPress={onAdd}
          hitSlop={8}
          className="min-h-11 justify-center px-2"
          accessibilityLabel={t("plan.timer.add", { seconds: ADD_SECONDS })}
        >
          <CmvText className="text-cmv-accent text-sm">
            {t("plan.timer.add", { seconds: ADD_SECONDS })}
          </CmvText>
        </Pressable>
        <Pressable
          onPress={isPaused ? onResume : onPause}
          hitSlop={8}
          className="min-h-11 justify-center px-2"
        >
          <CmvText className="text-cmv-accent text-sm">
            {t(isPaused ? "plan.timer.resume" : "plan.timer.pause")}
          </CmvText>
        </Pressable>
        <Pressable onPress={onSkip} hitSlop={8} className="min-h-11 justify-center px-2">
          <CmvText className="text-cmv-text-mid text-sm">{t("plan.timer.skip")}</CmvText>
        </Pressable>
      </View>
    </View>
  );
}

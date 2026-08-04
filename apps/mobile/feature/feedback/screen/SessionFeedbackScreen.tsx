import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";

/**
 * Débrief d'une séance (p4-1) : un champ texte libre + photos/vidéos, que l'athlète peut
 * reprendre plus tard.
 *
 * Écrire exige le réseau (pas d'écriture différée en MVP — CDC §12) : contrairement à la lecture
 * de la séance, on ne prétend pas fonctionner hors-ligne. L'échec est dit, pas masqué.
 *
 * L'écran ne fait que charger le débrief et disposer ses deux sections : le texte et les médias
 * ont chacun leurs mutations et leurs erreurs, qui ne se croisent jamais.
 */
export function SessionFeedbackScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: feedback, isPending, isError, refetch } = useSessionFeedback(id);

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}

        {isError ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isPending || isError ? null : (
          <>
            <View className="gap-1">
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {t("feedback.title")}
              </CmvText>
              <CmvText className="text-cmv-text-mid text-sm">{t("feedback.subtitle")}</CmvText>
            </View>

            <FeedbackTextSection sessionId={id} feedback={feedback ?? null} />

            <FeedbackMediaSection sessionId={id} feedback={feedback ?? null} />
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

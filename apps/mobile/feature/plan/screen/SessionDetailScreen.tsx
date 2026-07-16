import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatFullDay } from "@/shared/util/date.util";

/**
 * Détail d'une séance (p3-4) : consignes du coach, déroulé, documents.
 * Les documents sont des URLs signées à durée courte : ils exigent le réseau, contrairement au
 * déroulé qui, lui, reste lisible depuis le cache (dette P3-3).
 */
export function SessionDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session, isPending } = useScheduledSession(id);

  return (
    <CmvScreen>
      <OfflineBanner />

      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}

        {session == null ? null : (
          <>
            <View className="gap-1">
              <CmvText className="text-cmv-text-lo text-xs">
                {formatFullDay(session.scheduledDate)}
              </CmvText>
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {session.title}
              </CmvText>
              <CmvText className="text-cmv-accent text-xs">
                {t(`plan.sessionStatus.${session.status}`)}
              </CmvText>
            </View>

            {session.notes == null ? null : (
              <View className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface p-3">
                <CmvText className="text-cmv-text-mid text-xs">{t("plan.session.notes")}</CmvText>
                <CmvText className="text-cmv-text-hi">{session.notes}</CmvText>
              </View>
            )}

            <View className="gap-3">
              <CmvText className="text-cmv-text-mid text-xs">
                {t("plan.session.composition", { count: session.exercises.length })}
              </CmvText>

              {session.exercises.map((exercise, index) => (
                <View
                  key={exercise.id}
                  className="gap-2 rounded-lg border border-cmv-border bg-cmv-surface p-3"
                >
                  <View className="flex-row gap-2">
                    <CmvText className="text-cmv-text-lo">{index + 1}</CmvText>
                    <CmvText className="flex-1 text-cmv-text-hi">{exercise.title}</CmvText>
                    <CmvText className="text-cmv-accent text-xs">
                      {t(`plan.category.${exercise.category}`)}
                    </CmvText>
                  </View>

                  {/* Description et prescription sont nullables : rien à afficher, on n'affiche rien. */}
                  {exercise.description == null ? null : (
                    <CmvText className="text-cmv-text-mid text-sm">{exercise.description}</CmvText>
                  )}
                  {exercise.prescription == null ? null : (
                    <CmvText className="text-cmv-text-mid text-sm">{exercise.prescription}</CmvText>
                  )}

                  {exercise.documents.map((document) => (
                    <Pressable
                      key={document.id}
                      onPress={() => Linking.openURL(document.url)}
                      className="rounded-lg border border-cmv-border bg-cmv-bg-1 px-3 py-2"
                    >
                      <CmvText className="text-cmv-text-mid text-sm" numberOfLines={1}>
                        {document.fileName ?? t("plan.session.link")}
                      </CmvText>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

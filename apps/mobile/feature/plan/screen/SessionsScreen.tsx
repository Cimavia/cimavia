import {
  SESSION_SEGMENTS,
  type SessionsSegment,
  splitSessionsByDate,
  todayIsoDate,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SessionCard } from "@/feature/plan/component/SessionCard";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatFullDay } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.sessions: upcoming, past

// Onglet Séances (p3-4) : à venir / passées, dérivées des cycles servis — aucune requête de plus.
export function SessionsScreen() {
  const { t } = useTranslation();
  const { data: plans, isPending, isError, refetch } = useMyPlans();
  const [tab, setTab] = useState<SessionsSegment>("upcoming");

  // La frontière et l'ordre de chaque onglet sont décidés dans `@cmv/shared` (#376), avec le web.
  const entries = splitSessionsByDate(plans ?? [], todayIsoDate())[tab];

  // Le nom du cycle n'apparaît que si l'athlète en suit plusieurs (#172) : répété sur chaque carte
  // d'un cycle unique, il serait du bruit — c'est ce qui DISTINGUE qui mérite d'être écrit.
  const showPlanTitle = (plans ?? []).length > 1;

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="flex-row gap-2 p-4">
        {SESSION_SEGMENTS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            className={
              value === tab
                ? "rounded-lg bg-cmv-surface-hi px-3 py-2"
                : "rounded-lg border border-cmv-border px-3 py-2"
            }
          >
            <CmvText className={value === tab ? "text-cmv-text-hi" : "text-cmv-text-mid"}>
              {t(`plan.sessions.${value}`)}
            </CmvText>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-3 px-4 pb-4">
        {isPending ? <ActivityIndicator /> : null}

        {isError && plans == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {!isPending && !isError && entries.length === 0 ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("plan.sessions.empty")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">{t("plan.sessions.emptyHint")}</CmvText>
          </View>
        ) : null}

        {entries.map((entry) => (
          <View key={entry.session.id} className="gap-1">
            <CmvText className="text-cmv-text-lo text-xs">
              {formatFullDay(entry.session.scheduledDate)}
            </CmvText>
            <SessionCard
              session={entry.session}
              planLabel={showPlanTitle ? entry.planTitle : null}
              followEndedAt={entry.followEndedAt}
            />
          </View>
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

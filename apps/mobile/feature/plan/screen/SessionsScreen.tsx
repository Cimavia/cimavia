import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { todayIsoDate } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SessionCard } from "@/feature/plan/component/SessionCard";
import { useMyPlan } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatFullDay } from "@/shared/util/date.util";

type SessionsTab = "upcoming" | "past";

// Onglet Séances (p3-4) : à venir / passées, dérivés du cycle courant — aucune requête de plus.
export function SessionsScreen() {
  const { t } = useTranslation();
  const { data: plan, isPending, isError, refetch } = useMyPlan();
  const [tab, setTab] = useState<SessionsTab>("upcoming");

  const today = todayIsoDate();
  const allSessions = (plan?.weeks ?? []).flatMap((week) => week.sessions);

  const sessions = allSessions
    .filter((session) =>
      tab === "upcoming" ? session.scheduledDate >= today : session.scheduledDate < today,
    )
    // À venir : la plus proche d'abord. Passées : la plus récente d'abord.
    .sort((a, b) =>
      tab === "upcoming"
        ? a.scheduledDate.localeCompare(b.scheduledDate)
        : b.scheduledDate.localeCompare(a.scheduledDate),
    );

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="flex-row gap-2 p-4">
        {(["upcoming", "past"] as const).map((value) => (
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

        {isError && plan == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {!isPending && !isError && sessions.length === 0 ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("plan.sessions.empty")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">{t("plan.sessions.emptyHint")}</CmvText>
          </View>
        ) : null}

        {sessions.map((session: ScheduledSessionSummaryDto) => (
          <View key={session.id} className="gap-1">
            <CmvText className="text-cmv-text-lo text-xs">
              {formatFullDay(session.scheduledDate)}
            </CmvText>
            <SessionCard session={session} />
          </View>
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";

type SessionCardProps = {
  session: ScheduledSessionSummaryDto;
};

// Une séance dans la vue semaine ou la liste : titre, volume, statut. Mène au détail.
export function SessionCard({ session }: Readonly<SessionCardProps>) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/session/${session.id}`)}
      className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2"
    >
      <CmvText className="text-cmv-text-hi" numberOfLines={1}>
        {session.title}
      </CmvText>
      <View className="flex-row items-center gap-2">
        <CmvText className="text-cmv-text-lo text-xs">
          {t("plan.session.exerciseCount", { count: session.exerciseCount })}
        </CmvText>
        <CmvText className="text-cmv-accent text-xs">
          {t(`plan.sessionStatus.${session.status}`)}
        </CmvText>
      </View>
    </Pressable>
  );
}

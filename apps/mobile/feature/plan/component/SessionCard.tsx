import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { SESSION_STATUS_BADGE } from "@cmv/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvBadge, CmvText } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.sessionStatus: ScheduledSessionStatus

type SessionCardProps = {
  session: ScheduledSessionSummaryDto;
  /**
   * Le cycle d'où vient la séance, quand l'athlète en suit plusieurs (#172). `null` = un seul
   * cycle : l'étiquette serait alors la même partout et ne distinguerait rien. C'est l'appelant
   * qui le sait — la carte, elle, ne voit qu'une séance.
   */
  planLabel?: string | null;
  /**
   * La fin du suivi de son cycle (#911), `null` tant qu'il court. Requise : la liste et la semaine
   * la tiennent de l'entrée, et l'oublier effacerait la marque sans bruit.
   */
  followEndedAt: string | null;
};

// Une séance dans la vue semaine ou la liste : titre, volume, statut. Mène au détail.
export function SessionCard({
  session,
  planLabel = null,
  followEndedAt,
}: Readonly<SessionCardProps>) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/session/${session.id}`)}
      className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2"
    >
      {planLabel == null ? null : (
        <CmvText className="text-cmv-text-lo text-xs" numberOfLines={1}>
          {planLabel}
        </CmvText>
      )}
      <CmvText className="text-cmv-text-hi" numberOfLines={1}>
        {session.title}
      </CmvText>
      <View className="flex-row items-center gap-2">
        <CmvText className="text-cmv-text-lo text-xs">
          {t("plan.session.exerciseCount", { count: session.exerciseCount })}
        </CmvText>
        {/* Seule la séance faite se colore, en vert : le terracotta se lisait comme une erreur
            (#570). La couleur se décide dans @cmv/shared, une fois pour les deux apps. */}
        <CmvBadge
          label={t(`plan.sessionStatus.${session.status}`)}
          variant={SESSION_STATUS_BADGE[session.status]}
        />
      </View>
      {/* La marque d'une archive (#911) : la séance se relit, son débrief ne s'écrit plus. Sans
          date — la carte est petite, le détail de la séance la donne. */}
      {followEndedAt == null ? null : (
        <CmvText className="text-cmv-text-lo text-xs">{t("follow.ended")}</CmvText>
      )}
    </Pressable>
  );
}

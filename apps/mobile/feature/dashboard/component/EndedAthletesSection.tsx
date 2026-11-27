import { type CoachAthleteDto, type ConversationDto, directConversationWith } from "@cmv/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { CmvArchiveList } from "@/shared/component/CmvArchiveList";
import { useArchiveThreadActions } from "@/shared/hook/useArchiveThreadActions";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";

type EndedAthletesSectionProps = {
  /** Les athlètes dont le suivi a pris fin, le plus récent d'abord (`splitFollows`). */
  athletes: readonly CoachAthleteDto[];
  /** `undefined` tant que la liste n'est pas lue : le fil ne s'offre alors pas encore. */
  conversations: readonly ConversationDto[] | undefined;
};

/**
 * Les suivis terminés du Coach (#911, pendant du web de #910), sous ses athlètes : sa fiche et son
 * fil se relisent, rien ne s'y écrit. Hors des lignes, et c'est le point — elles disent ce qui
 * attend le Coach, et un suivi terminé n'attend plus rien. Mettre fin au suivi, lui, reste un geste
 * du web.
 *
 * Le fil s'ouvre à titre de Coach (`useArchiveThreadActions`) ; la fiche, elle, s'offre toujours.
 */
export function EndedAthletesSection({
  athletes,
  conversations,
}: Readonly<EndedAthletesSectionProps>) {
  const { t } = useTranslation();
  const endedText = useFollowEndedText();
  const threadActions = useArchiveThreadActions("coach");

  const items = athletes.map((athlete) => ({
    id: athlete.id,
    name: athlete.athleteName,
    detail: endedText(athlete.endedAt),
    actions: [
      ...threadActions(directConversationWith(conversations, athlete.athleteId, "athlete")),
      {
        label: t("follow.archive.sheet"),
        onPress: () => router.push(`/athlete/${athlete.athleteId}`),
      },
    ],
  }));

  return (
    <CmvArchiveList
      title={t("follow.archive.athletes", { count: athletes.length })}
      items={items}
    />
  );
}

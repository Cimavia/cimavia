import { type CoachAthleteDto, type ConversationDto, directConversationWith } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvArchiveList, CmvButton } from "@/shared/component";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";

type EndedAthletesSectionProps = {
  /** Les athlètes dont le suivi a pris fin, le plus récent d'abord (`splitFollows`). */
  athletes: readonly CoachAthleteDto[];
  /** `undefined` tant que la liste n'est pas lue : le fil ne s'offre alors pas encore. */
  conversations: readonly ConversationDto[] | undefined;
  onOpenSheet: (athleteId: string) => void;
};

/**
 * Les suivis terminés du Coach (#910), sous le tableau de suivi : sa fiche et son fil se relisent,
 * rien ne s'y écrit. Hors du tableau, et c'est le point — ses colonnes disent ce qui attend le
 * Coach, et un suivi terminé n'attend plus rien.
 *
 * Le fil s'ouvre par son id : la messagerie n'ouvre `?athlete=` que vers un athlète encore suivi.
 * Sans fil (jamais écrit, ou liste pas encore lue), il n'y a rien à relire, et pas de bouton.
 */
export function EndedAthletesSection({
  athletes,
  conversations,
  onOpenSheet,
}: Readonly<EndedAthletesSectionProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const endedText = useFollowEndedText();

  const items = athletes.map((athlete) => {
    const thread = directConversationWith(conversations, athlete.athleteId, "athlete");
    return {
      id: athlete.id,
      name: athlete.athleteName,
      detail: endedText(athlete.endedAt),
      actions: (
        <>
          {thread == null ? null : (
            <CmvButton
              variant="ghost"
              onClick={() =>
                navigate({
                  to: "/messages",
                  search: {
                    athlete: undefined,
                    coach: undefined,
                    conversation: thread.id,
                    as: "coach",
                    q: undefined,
                  },
                })
              }
            >
              {t("follow.archive.thread")}
            </CmvButton>
          )}
          <CmvButton variant="ghost" onClick={() => onOpenSheet(athlete.athleteId)}>
            {t("dashboard.table.openSheet")}
          </CmvButton>
        </>
      ),
    };
  });

  return (
    <CmvArchiveList
      title={t("follow.archive.athletes", { count: athletes.length })}
      items={items}
    />
  );
}

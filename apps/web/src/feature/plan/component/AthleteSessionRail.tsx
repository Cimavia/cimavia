import { type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";
import { useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";

type AthleteSessionRailProps = {
  session: ScheduledSessionDto;
  /**
   * Le sommaire des blocs et « Mon suivi » (#722), ou `null` pour une séance sans bloc : il n'y a
   * alors rien à sommer ni à cocher.
   */
  blocks: ReactNode;
  onOpenFeedback: () => void;
};

/**
 * Le rail de droite : sommaire, note du coach, et le débrief collé en bas.
 *
 * Le rail se réduit à ce qui EXISTE : sans bloc, ni sommaire ni suivi — un rail qui
 * garderait ses intitulés vides ferait croire à un chargement qui n'arrive jamais. Le débrief,
 * lui, reste (#276) : il ne dépend pas de la composition, et c'est le seul geste qui reste.
 */
export function AthleteSessionRail({
  session,
  blocks,
  onOpenFeedback,
}: Readonly<AthleteSessionRailProps>) {
  const { t } = useTranslation();
  // Une séance qu'il s'est programmée lui-même : il n'y a personne à qui écrire.
  const isSelf = useIsSelfAthlete()(session.coachId);

  return (
    // `sticky` : le sommaire suit le défilement, c'est toute sa raison d'être.
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      {blocks}

      {session.notes == null ? null : (
        <CmvCard>
          <div className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">{t("plan.athlete.notes")}</span>
            <p className="text-cmv-body text-cmv-text-hi">{session.notes}</p>
          </div>
        </CmvCard>
      )}

      {/* Le fil du coach DE CETTE SÉANCE (#599), pas « le » coach : un athlète suivi par
          plusieurs coachs écrit à celui qui l'a programmée. */}
      {isSelf ? null : (
        <Link
          to="/messages"
          search={{
            athlete: undefined,
            coach: session.coachId,
            conversation: undefined,
            as: "athlete",
            q: undefined,
          }}
          className="text-cmv-caption text-cmv-accent hover:underline"
        >
          {t("plan.athlete.contactCoach", { name: session.coachName })}
        </Link>
      )}

      {/* INCONDITIONNEL (#276) : une séance sans exercice se débriefe comme les autres. Seul le
          SOMMAIRE ci-dessus dépend de la composition — il n'y a rien à sommer. */}
      <CmvButton onClick={onOpenFeedback}>
        {/* Le libellé dit si le débrief existe DÉJÀ : « débriefer » sur une séance débriefée
            laisserait croire qu'on écrase. Il suit le STATUT, jamais la composition. */}
        {session.status === ScheduledSessionStatus.DONE
          ? t("feedback.openDone")
          : t("feedback.open")}
      </CmvButton>
      {blocks == null ? null : (
        <p className="text-cmv-caption text-cmv-text-lo">{t("plan.athlete.blocks.sent")}</p>
      )}
    </aside>
  );
}

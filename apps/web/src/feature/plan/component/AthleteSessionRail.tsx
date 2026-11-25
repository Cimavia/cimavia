import { canDebrief, type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";
import { useIsSelfAthlete } from "@/shared/hook/useAthleteLabel";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";

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
  // Suivi terminé (#910) : la séance se relit, rien ne part plus vers le Coach — ni débrief, ni
  // message par ce lien, qui n'ouvre qu'un fil encore suivi.
  const isOpen = canDebrief(session);
  const followEndedText = useFollowEndedText();

  return (
    // `sticky` : le sommaire suit le défilement, c'est toute sa raison d'être.
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      {blocks}

      {session.notes == null ? null : (
        <CmvCard>
          <div className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-caption text-cmv-text-mid">{t("plan.athlete.notes")}</span>
            {/* Une URL collée ne force plus la colonne de 320 px (#584). */}
            <p className="text-cmv-body text-cmv-text-hi wrap-anywhere">{session.notes}</p>
          </div>
        </CmvCard>
      )}

      {/* Le fil du coach DE CETTE SÉANCE (#599), pas « le » coach : un athlète suivi par
          plusieurs coachs écrit à celui qui l'a programmée. */}
      {isSelf || !isOpen ? null : (
        <Link
          to="/messages"
          search={{
            athlete: undefined,
            coach: session.coachId,
            conversation: undefined,
            as: "athlete",
            q: undefined,
          }}
          className="text-cmv-caption text-cmv-accent-on hover:underline"
        >
          {t("plan.athlete.contactCoach", { name: session.coachName })}
        </Link>
      )}

      {/* Indépendant de la composition (#276) : une séance sans exercice se débriefe comme les
          autres. Seul le SOMMAIRE ci-dessus en dépend — il n'y a rien à sommer. */}
      {isOpen ? (
        <CmvButton onClick={onOpenFeedback}>
          {/* Le libellé dit si le débrief existe DÉJÀ : « débriefer » sur une séance débriefée
              laisserait croire qu'on écrase. Il suit le STATUT, jamais la composition. */}
          {session.status === ScheduledSessionStatus.DONE
            ? t("feedback.openDone")
            : t("feedback.open")}
        </CmvButton>
      ) : (
        <ClosedDebrief
          // Un débrief envoyé se relit encore ; une séance jamais débriefée n'a rien à rouvrir.
          onRead={session.status === ScheduledSessionStatus.DONE ? onOpenFeedback : null}
          note={t("plan.athlete.followEnded", { ended: followEndedText(session.followEndedAt) })}
        />
      )}
      {blocks == null || !isOpen ? null : (
        <p className="text-cmv-caption text-cmv-text-lo">{t("plan.athlete.blocks.sent")}</p>
      )}
    </aside>
  );
}

/** Le débrief d'une séance dont le suivi a pris fin (#910) : ce qui en reste, et pourquoi. */
function ClosedDebrief({ onRead, note }: Readonly<{ onRead: (() => void) | null; note: string }>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-cmv-xs">
      {onRead == null ? null : (
        <CmvButton variant="secondary" onClick={onRead}>
          {t("feedback.openRead")}
        </CmvButton>
      )}
      <p className="text-cmv-caption text-cmv-text-lo">{note}</p>
    </div>
  );
}

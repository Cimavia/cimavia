import type { CoachAthleteDto } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useMyCoach, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { CmvAppShell, CmvAvatar, CmvCard, CmvErrorState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";
import { formatDate } from "@/shared/util/date.util";

/**
 * « Mon coach » côté web (#28) — équivalent de `JoinCoachScreen` sur mobile, dont il reprend le
 * flux : soit l'athlète est lié et on le lui montre, soit il ne l'est pas et on lui dit à quelle
 * adresse son coach doit l'inviter.
 *
 * Il n'y a plus de code à saisir (#390) : une invitation vise une adresse, et n'apparaît qu'au
 * compte qui la porte. L'acceptation passe par la carte de l'invitation, et par elle seule.
 *
 * Un QUATRIÈME s'y superpose depuis #146 : « une invitation t'attend ». Il ne remplace aucun des
 * trois — il se pose AU-DESSUS, dans les deux branches. Déjà lié, l'athlète la voit quand même,
 * inacceptable mais refusable : c'est ce refus qui vide la liste d'attente de l'inviteur, et le
 * masquer laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien.
 */
export function MyCoachScreen() {
  const { t } = useTranslation();
  const { data: coach, isPending, isError, refetch } = useMyCoach();

  return (
    <CmvAppShell title={t("coach.title")} subtitle={t("coach.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Panne réseau et « pas de coach » sont deux choses différentes : dire « aucun coach » sur
          une API injoignable inquiéterait un athlète qui en a déjà un. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError ? (
        <div className="flex flex-col gap-cmv-lg">
          <PendingInvitations currentCoachName={coach?.coachName ?? null} />
          {coach == null ? <NoCoachCard /> : <LinkedCoachCard coach={coach} />}
        </div>
      ) : null}
    </CmvAppShell>
  );
}

/**
 * Ce qui attend l'athlète, s'il y a quelque chose — et rien du tout sinon.
 *
 * **Une requête en échec ne s'annonce pas comme une liste vide** : dans les deux cas on ne rend
 * rien, mais on n'écrit jamais « aucune invitation » sur une API injoignable. C'est le même
 * raisonnement que l'état d'erreur de l'écran, qui refuse de dire « aucun coach » quand il n'a pas
 * pu lire — sauf qu'ici l'absence d'invitation est le cas ORDINAIRE, et qu'un bandeau d'erreur
 * pour ça inquiéterait sans rien apprendre.
 */
function PendingInvitations({ currentCoachName }: Readonly<{ currentCoachName: string | null }>) {
  const { data: invitations } = useMyInvitations();
  if (invitations == null || invitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-cmv-md">
      {invitations.map((invitation) => (
        <PendingInvitationCard
          key={invitation.id}
          invitation={invitation}
          currentCoachName={currentCoachName}
        />
      ))}
    </div>
  );
}

/**
 * L'athlète est lié. Le bouton « Message » de la maquette est là depuis #29 — il attendait sa
 * destination, `/messages` étant fermée à l'athlète jusque-là. Un bouton qui renvoie à l'accueil
 * est exactement le cul-de-sac que cette épic supprime.
 */
function LinkedCoachCard({ coach }: Readonly<{ coach: CoachAthleteDto }>) {
  const { t } = useTranslation();

  return (
    <CmvCard>
      <div className="flex items-center gap-cmv-md">
        <CmvAvatar name={coach.coachName} />
        <div className="flex flex-1 flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{coach.coachName}</h2>
          {/* `joinedAt` est nullable (la relation peut avoir été posée sans passer par une
              acceptation) : « — » plutôt qu'une date inventée. */}
          <p className="text-cmv-caption text-cmv-text-mid">
            {coach.joinedAt == null
              ? t("coach.linked.sinceUnknown")
              : t("coach.linked.since", { date: formatDate(coach.joinedAt.slice(0, 10)) })}
          </p>
        </div>

        <Link
          to="/messages"
          // `?athlete=` désigne le fil ouvert côté coach : l'athlète n'en a qu'un, le paramètre
          // reste donc absent. La clé est REQUISE mais peut valoir undefined (cf. la route).
          // `as` : c'est un écran d'athlète, le fil s'ouvre donc à ce titre.
          search={{ athlete: undefined, as: "athlete" }}
          className="inline-flex items-center rounded-cmv-md border border-cmv-border px-cmv-lg py-cmv-sm text-cmv-body text-cmv-text-mid transition-colors hover:border-cmv-border-hi hover:text-cmv-text-hi"
        >
          {t("coach.linked.message")}
        </Link>
      </div>
    </CmvCard>
  );
}

/**
 * L'athlète n'a pas de coach : on lui dit à quelle adresse son coach doit l'inviter (#390).
 *
 * C'est le seul recours qui reste à une invitation partie vers une autre adresse : sans code à
 * saisir, un compte créé avec une autre adresse ne verrait jamais la carte, et rien ne lui dirait
 * pourquoi. L'adresse affichée est celle qu'il peut donner à son coach.
 */
function NoCoachCard() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  return (
    <CmvCard>
      <div className="flex max-w-md flex-col gap-cmv-xs">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("coach.missing.title")}</h2>
        <p className="text-cmv-body text-cmv-text-mid">{t("coach.missing.description")}</p>
        <p className="mt-cmv-sm text-cmv-caption text-cmv-text-lo">{t("coach.missing.address")}</p>
        {/* Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5). */}
        <p className="text-cmv-body text-cmv-text-hi">{session?.user.email ?? "—"}</p>
      </div>
    </CmvCard>
  );
}

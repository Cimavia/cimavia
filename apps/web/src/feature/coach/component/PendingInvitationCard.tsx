import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvCard, CmvConfirmButton } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

type PendingInvitationCardProps = {
  invitation: PendingInvitationDto;
  /**
   * Le nom du coach ACTUEL, ou `null` si l'athlète est autonome. C'est lui qui décide si
   * l'invitation est acceptable — et il est passé plutôt que relu ici, pour que la carte n'ait
   * qu'une source de vérité : celle de l'écran qui la monte.
   */
  currentCoachName: string | null;
};

/**
 * Une invitation qui attend l'athlète (#146) — le quatrième état de « Mon coach », à côté de
 * « lié », « aucun coach » et « code refusé ».
 *
 * **Elle s'affiche dans les DEUX branches**, y compris quand l'athlète a déjà un coach. La masquer
 * là laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien — et surtout,
 * refuser est le geste UTILE dans ce cas : c'est lui qui vide la liste d'attente de l'inviteur.
 * « Rejoindre » est alors désactivé, avec sa raison écrite : un athlète a au plus un coach.
 *
 * Elle ne remplace pas le formulaire de code, qui reste le chemin des invitations génériques.
 */
export function PendingInvitationCard({
  invitation,
  currentCoachName,
}: Readonly<PendingInvitationCardProps>) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const linked = currentCoachName != null;
  const busy = accept.isPending || decline.isPending;

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">
            {t("coach.invitation.title", { name: invitation.coachName })}
          </h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
          </p>
        </div>

        {/* La raison AVANT le bouton désactivé : un bouton grisé sans explication laisse chercher
            ce qui cloche, alors que la cause est une règle du produit — au plus un coach. */}
        {linked ? (
          <p className="rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-body text-cmv-text-mid">
            {t("coach.invitation.blocked", { name: currentCoachName })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-cmv-sm">
          <CmvButton
            disabled={linked || busy}
            onClick={() => accept.mutate({ code: invitation.code })}
          >
            {accept.isPending
              ? t("coach.invitation.joining")
              : t("coach.invitation.join", { name: invitation.coachName })}
          </CmvButton>

          {/* Armé comme une suppression : le refus est sans retour, le coach devra réémettre. */}
          <CmvConfirmButton
            label={t("coach.invitation.decline")}
            confirmLabel={t("coach.invitation.declineConfirm")}
            cancelLabel={t("common.cancel")}
            disabled={busy}
            onConfirm={() => decline.mutate({ code: invitation.code })}
          />
        </div>

        <p className="text-cmv-caption text-cmv-text-lo">{t("coach.invitation.declineHint")}</p>
      </div>
    </CmvCard>
  );
}

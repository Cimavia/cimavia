import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvCard, CmvConfirmButton } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

/**
 * Une invitation qui attend l'athlète (#146), posée au-dessus de « Mes coachs ».
 *
 * Elle s'affiche qu'il ait déjà des coachs ou non, et reste acceptable dans les deux cas depuis
 * #599 : un athlète est suivi par 0..N coachs. Refuser vide la liste d'attente de l'inviteur.
 *
 * Elle est le SEUL chemin pour rejoindre un coach depuis #390 : il n'y a plus de code à saisir.
 */
export function PendingInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const busy = accept.isPending || decline.isPending;

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">
            {t("coach.invitation.title", { name: invitation.issuer.name })}
          </h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-cmv-sm">
          <CmvButton disabled={busy} onClick={() => accept.mutate(invitation.id)}>
            {accept.isPending
              ? t("coach.invitation.joining")
              : t("coach.invitation.join", { name: invitation.issuer.name })}
          </CmvButton>

          {/* Armé comme une suppression : le refus est sans retour, le coach devra réémettre. */}
          <CmvConfirmButton
            label={t("coach.invitation.decline")}
            confirmLabel={t("coach.invitation.declineConfirm")}
            cancelLabel={t("common.cancel")}
            disabled={busy}
            onConfirm={() => decline.mutate(invitation.id)}
          />
        </div>

        <p className="text-cmv-caption text-cmv-text-lo">{t("coach.invitation.declineHint")}</p>
      </div>
    </CmvCard>
  );
}

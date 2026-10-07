import type { PendingOrganizationInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import {
  useAcceptOrganizationInvitation,
  useDeclineOrganizationInvitation,
} from "@/feature/company/hook/useOrganization";
import { CmvAvatar, CmvButton, CmvCard, CmvConfirmButton } from "@/shared/component";
import { formatInstantDate } from "@/shared/util/date.util";

/**
 * Une entreprise invite le Coach courant à rejoindre son équipe (#601, maquette entreprise
 * frame 7), posée en tête de son tableau de bord. Elle vit dans `feature/company` parce qu'elle
 * est l'autre bout du flux de l'entreprise, pas un morceau du tableau de bord.
 *
 * La carte disparaît après Accepter ou Refuser : les deux périment la liste qui la porte.
 */
export function OrganizationInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingOrganizationInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptOrganizationInvitation();
  const decline = useDeclineOrganizationInvitation();

  const busy = accept.isPending || decline.isPending;
  const name = invitation.organizationName;

  return (
    <CmvCard>
      <div className="flex flex-wrap items-center gap-cmv-md">
        <CmvAvatar name={name} />
        <div className="flex flex-1 flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">
            {t("coach.organizationInvitation.title", { name })}
          </h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("coach.organizationInvitation.description", { name })}
          </p>
          <p className="text-cmv-caption text-cmv-text-lo">
            {t("coach.organizationInvitation.expires", {
              date: formatInstantDate(invitation.expiresAt),
            })}
          </p>
        </div>

        {/* Armé comme une suppression : le refus est sans retour, l'entreprise devra réinviter. */}
        <CmvConfirmButton
          label={t("coach.organizationInvitation.decline")}
          confirmLabel={t("coach.organizationInvitation.declineConfirm")}
          cancelLabel={t("common.cancel")}
          disabled={busy}
          onConfirm={() => decline.mutate(invitation.id)}
        />
        <CmvButton disabled={busy} onClick={() => accept.mutate(invitation.id)}>
          {accept.isPending
            ? t("coach.organizationInvitation.accepting")
            : t("coach.organizationInvitation.accept")}
        </CmvButton>
      </div>
    </CmvCard>
  );
}

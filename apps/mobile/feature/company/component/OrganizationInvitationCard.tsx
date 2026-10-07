import type { PendingOrganizationInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  useAcceptOrganizationInvitation,
  useDeclineOrganizationInvitation,
} from "@/feature/company/hook/useOrganizationInvitations";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatInstantDate } from "@/shared/util/date.util";

/**
 * Une entreprise invite le Coach courant à rejoindre son équipe (#601) — jumelle de la carte du
 * tableau de bord web : mêmes gestes, sous les mêmes conditions. La carte disparaît après Accepter
 * ou Refuser.
 */
export function OrganizationInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingOrganizationInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptOrganizationInvitation();
  const decline = useDeclineOrganizationInvitation();

  const busy = accept.isPending || decline.isPending;
  const name = invitation.organizationName;
  const failure = accept.error ?? decline.error;

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
          {t("coach.organizationInvitation.title", { name })}
        </CmvText>
        <CmvText className="text-cmv-text-mid text-sm">
          {t("coach.organizationInvitation.description", { name })}
        </CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {t("coach.organizationInvitation.expires", {
            date: formatInstantDate(invitation.expiresAt),
          })}
        </CmvText>
      </View>

      <CmvButton
        label={
          accept.isPending
            ? t("coach.organizationInvitation.accepting")
            : t("coach.organizationInvitation.accept")
        }
        onPress={() => accept.mutate(invitation.id)}
        disabled={busy}
      />

      {/* Armé en deux temps comme une suppression : le refus est sans retour. */}
      <CmvConfirmButton
        label={t("coach.organizationInvitation.decline")}
        confirmLabel={t("coach.organizationInvitation.declineConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={busy}
        onConfirm={() => decline.mutate(invitation.id)}
      />

      {/* Le mobile n'a pas de toasts : l'échec se dit sur place, sinon le bouton repasse à son
          libellé et rien d'autre ne se passe (#365). */}
      {failure == null ? null : (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(failure) ?? t("coach.organizationInvitation.error")}
        </CmvText>
      )}
    </View>
  );
}

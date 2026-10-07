import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDateTime } from "@/shared/util/date.util";

/**
 * Une invitation qui attend l'athlète (#146) — jumelle de celle du web, et la parité est le point :
 * les deux surfaces doivent proposer les mêmes gestes, sous les mêmes conditions.
 *
 * Elle s'affiche qu'il ait déjà des coachs ou non, et reste acceptable dans les deux cas depuis
 * #599 : un athlète est suivi par 0..N coachs. Refuser vide la liste d'attente de l'inviteur.
 */
export function PendingInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const busy = accept.isPending || decline.isPending;

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
          {t("coach.invitation.title", { name: invitation.issuer.name })}
        </CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
        </CmvText>
      </View>

      <CmvButton
        label={
          accept.isPending
            ? t("coach.invitation.joining")
            : t("coach.invitation.join", { name: invitation.issuer.name })
        }
        onPress={() => accept.mutate(invitation.id)}
        disabled={busy}
      />

      {/* Armé en deux temps comme une suppression : le refus est sans retour, le coach devra
          réémettre. */}
      <CmvConfirmButton
        label={t("coach.invitation.decline")}
        confirmLabel={t("coach.invitation.declineConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={busy}
        onConfirm={() => decline.mutate(invitation.id)}
      />

      <CmvText className="text-cmv-text-lo text-xs">{t("coach.invitation.declineHint")}</CmvText>

      {/* Le mobile n'a pas de toasts : l'échec se dit sur place. L'acceptation échouait en silence (#365) — le bouton repassait à son libellé, et l'athlète
          recliquait en boucle sur une invitation expirée ou déjà utilisée. */}
      {accept.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(accept.error) ?? t("coach.invitation.joinError")}
        </CmvText>
      ) : null}
      {decline.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(decline.error) ?? t("coach.invitation.declineError")}
        </CmvText>
      ) : null}
    </View>
  );
}

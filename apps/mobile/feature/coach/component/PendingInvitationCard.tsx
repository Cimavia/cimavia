import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDateTime } from "@/shared/util/date.util";

type PendingInvitationCardProps = {
  invitation: PendingInvitationDto;
  /**
   * Le nom du coach ACTUEL, ou `null` si l'athlète est autonome. C'est lui qui décide si
   * l'invitation est acceptable — passé plutôt que relu ici, pour que la carte n'ait qu'une source
   * de vérité : celle de l'écran qui la monte.
   */
  currentCoachName: string | null;
};

/**
 * Une invitation qui attend l'athlète (#146) — jumelle de celle du web, et la parité est le point :
 * les deux surfaces doivent proposer les mêmes gestes, sous les mêmes conditions.
 *
 * **Elle s'affiche dans les DEUX branches**, y compris quand l'athlète a déjà un coach. La masquer
 * là laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien — et refuser
 * est justement le geste utile dans ce cas : c'est lui qui vide la liste d'attente de l'inviteur.
 * « Rejoindre » est alors fermé, avec sa raison écrite.
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
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
          {t("coach.invitation.title", { name: invitation.coachName })}
        </CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
        </CmvText>
      </View>

      {/* La raison AVANT le bouton fermé : un bouton grisé sans explication laisse chercher ce qui
          cloche, alors que la cause est une règle du produit — au plus un coach. */}
      {linked ? (
        <CmvText className="text-cmv-text-mid text-sm">
          {t("coach.invitation.blocked", { name: currentCoachName })}
        </CmvText>
      ) : null}

      <CmvButton
        label={
          accept.isPending
            ? t("coach.invitation.joining")
            : t("coach.invitation.join", { name: invitation.coachName })
        }
        onPress={() => accept.mutate({ code: invitation.code })}
        disabled={linked || busy}
      />

      {/* Armé en deux temps comme une suppression : le refus est sans retour, le coach devra
          réémettre. */}
      <CmvConfirmButton
        label={t("coach.invitation.decline")}
        confirmLabel={t("coach.invitation.declineConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={busy}
        onConfirm={() => decline.mutate({ code: invitation.code })}
      />

      <CmvText className="text-cmv-text-lo text-xs">{t("coach.invitation.declineHint")}</CmvText>

      {/* Le mobile n'a pas de toasts : l'échec se dit sur place, comme pour la saisie du code. */}
      {decline.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(decline.error) ?? t("coach.invitation.declineError")}
        </CmvText>
      ) : null}
    </View>
  );
}

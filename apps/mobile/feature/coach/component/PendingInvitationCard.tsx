import type { PendingInvitationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAcceptInvitation, useDeclineInvitation } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDateTime } from "@/shared/util/date.util";

type Issuer = PendingInvitationDto["issuer"];

/**
 * Une invitation qui attend l'athlète (#146) — jumelle de celle du web, et la parité est le point :
 * les deux surfaces doivent proposer les mêmes gestes, sous les mêmes conditions.
 *
 * Elle s'affiche qu'il ait déjà des coachs ou non, et reste acceptable dans les deux cas depuis
 * #599 : un athlète est suivi par 0..N coachs. Refuser vide la liste d'attente de l'inviteur.
 *
 * L'émetteur est un Coach, ou une entreprise depuis #602 : la carte nomme alors les Coachs qui le
 * suivront, tous ceux de l'entreprise — accepter n'en choisit aucun.
 */
export function PendingInvitationCard({
  invitation,
}: Readonly<{ invitation: PendingInvitationDto }>) {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const { issuer } = invitation;
  const fromCoach = issuer.kind === "coach";
  const busy = accept.isPending || decline.isPending;

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
          {fromCoach
            ? t("coach.invitation.title", { name: issuer.name })
            : t("coach.invitation.fromOrganization.title", { name: issuer.name })}
        </CmvText>
        <CmvText className="text-cmv-text-lo text-xs">
          {t("coach.invitation.expires", { date: formatDateTime(invitation.expiresAt) })}
        </CmvText>
      </View>

      {issuer.kind === "organization" ? <FutureCoaches names={issuer.coachNames} /> : null}

      <CmvButton
        label={acceptLabel(t, issuer, accept.isPending)}
        onPress={() => accept.mutate(invitation.id)}
        disabled={busy}
      />

      {/* Armé en deux temps comme une suppression : le refus est sans retour, l'inviteur devra
          réémettre. */}
      <CmvConfirmButton
        label={t("coach.invitation.decline")}
        confirmLabel={t("coach.invitation.declineConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={busy}
        onConfirm={() => decline.mutate(invitation.id)}
      />

      <CmvText className="text-cmv-text-lo text-xs">
        {fromCoach
          ? t("coach.invitation.declineHint")
          : t("coach.invitation.fromOrganization.declineHint", { name: issuer.name })}
      </CmvText>

      {/* Le mobile n'a pas de toasts : l'échec se dit sur place. L'acceptation échouait en silence (#365) — le bouton repassait à son libellé, et l'athlète
          recliquait en boucle sur une invitation expirée ou déjà utilisée. */}
      {accept.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(accept.error) ??
            (fromCoach
              ? t("coach.invitation.joinError")
              : t("coach.invitation.fromOrganization.acceptError"))}
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

/** « Rejoindre M » pour un Coach ; « Accepter » pour une entreprise, qui n'est pas un coach. */
function acceptLabel(
  t: ReturnType<typeof useTranslation>["t"],
  issuer: Issuer,
  pending: boolean,
): string {
  if (pending) return t("coach.invitation.joining");
  return issuer.kind === "coach"
    ? t("coach.invitation.join", { name: issuer.name })
    : t("coach.invitation.fromOrganization.accept");
}

/**
 * Les Coachs qui suivront l'athlète s'il accepte. Liste VIDE = l'entreprise n'en a pas encore :
 * ils le suivront dès leur arrivée (#602) — un état à dire, pas une donnée manquante.
 */
function FutureCoaches({ names }: Readonly<{ names: string[] }>) {
  const { t } = useTranslation();

  if (names.length === 0) {
    return (
      <CmvText className="text-cmv-text-mid text-sm">
        {t("coach.invitation.fromOrganization.noCoach")}
      </CmvText>
    );
  }
  return (
    <View className="gap-1">
      <CmvText className="text-cmv-text-lo text-xs">
        {t("coach.invitation.fromOrganization.coaches")}
      </CmvText>
      {/* Deux Coachs peuvent porter le même nom ; la liste, figée, ne se réordonne jamais. */}
      {names.map((name, index) => (
        <CmvText key={`${index}:${name}`} className="text-cmv-text-hi">
          {name}
        </CmvText>
      ))}
    </View>
  );
}

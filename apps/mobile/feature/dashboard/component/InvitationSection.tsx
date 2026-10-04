import { type InvitationDto, InvitationStatus, invitationEmailOf } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useCreateInvitation, useInvitations, useRevokeInvitation } from "@/feature/athlete";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDateTime } from "@/shared/util/date.util";

/**
 * Invitation d'un athlète : le coach saisit une adresse, et l'invitation n'apparaît qu'au compte
 * qui la porte (#390).
 *
 * Il n'y a plus de code à transmettre — ni à partager, ni à copier : c'est l'adresse de la session
 * qui fait le verrou, et l'athlète accepte depuis la carte qui l'attend. Le mobile ne savait
 * émettre que des invitations génériques, inutilisables depuis que preview n'accepte plus
 * d'inscription sans adresse invitée (#263).
 *
 * La liste est celle du web pour les invitations EN ATTENTE, adresse affichée : c'est la seule
 * preuve que le geste a porté, le mobile n'ayant pas de toasts. Chacune s'y retire, comme sur le
 * web (#524). Les refusées restent au web.
 */
export function InvitationSection() {
  const { t } = useTranslation();
  const { data: invitations } = useInvitations();
  const create = useCreateInvitation();
  const [email, setEmail] = useState("");

  // `null` tant que la saisie n'est pas une adresse : le bouton reste fermé, et l'API ne voit
  // jamais partir ce qu'elle refuserait d'un message de validation brut (#319).
  const target = invitationEmailOf(email);
  // Un seul envoi, pour le bouton ET la touche « Envoyer » du clavier — celle-ci n'est pas fermée
  // par `disabled`, c'est donc ici que la saisie invalide s'arrête.
  function submit() {
    if (target == null) return;
    // Le champ ne se vide qu'au succès : un échec laisse l'adresse à corriger, pas à retaper.
    create.mutate({ email: target }, { onSuccess: () => setEmail("") });
  }

  const pending = (invitations ?? []).filter(
    (invitation) => invitation.status === InvitationStatus.PENDING,
  );

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("athlete.invite.title")}</CmvText>
      <CmvText className="text-cmv-text-lo text-sm">{t("athlete.invite.description")}</CmvText>

      <CmvTextField
        label={t("athlete.invite.emailLabel")}
        placeholder={t("athlete.invite.emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!create.isPending}
        returnKeyType="send"
        onSubmitEditing={submit}
      />

      <CmvButton
        label={create.isPending ? t("athlete.invite.creating") : t("athlete.invite.action")}
        onPress={submit}
        disabled={target == null || create.isPending}
      />

      {create.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(create.error) ?? t("athlete.invite.error")}
        </CmvText>
      ) : null}

      {pending.length === 0 ? null : (
        <View className="gap-2">
          <CmvText className="text-cmv-text-mid text-xs uppercase">
            {t("athlete.invite.pending")}
          </CmvText>
          {pending.map((invitation) => (
            <PendingInvitationRow key={invitation.id} invitation={invitation} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Une invitation en attente, et le geste qui la retire (#524) — une adresse erronée restait sinon
 * acceptable sept jours par qui la détient.
 *
 * Armé en deux temps comme sur le web (parité de #147) : le retrait est sans retour. Sa propre
 * mutation par ligne, pour que l'échec se dise sous l'invitation qu'il concerne — pas de toasts.
 */
function PendingInvitationRow({ invitation }: Readonly<{ invitation: InvitationDto }>) {
  const { t } = useTranslation();
  const revoke = useRevokeInvitation();

  return (
    <View className="gap-1 border-cmv-border border-t pt-2">
      {/* L'adresse EST l'invitation : c'est elle seule qui dit à qui elle apparaîtra. */}
      <CmvText className="text-cmv-text-hi">{invitation.email}</CmvText>
      <CmvText className="text-cmv-text-lo text-xs">
        {t("athlete.invite.expires", { date: formatDateTime(invitation.expiresAt) })}
      </CmvText>
      <CmvConfirmButton
        label={t("athlete.invite.revoke")}
        confirmLabel={t("athlete.invite.revokeConfirm")}
        cancelLabel={t("common.cancel")}
        disabled={revoke.isPending}
        onConfirm={() => revoke.mutate(invitation.id)}
      />
      {revoke.isError ? (
        <CmvText className="text-cmv-error text-sm">
          {apiErrorMessage(revoke.error) ?? t("athlete.invite.revokeError")}
        </CmvText>
      ) : null}
    </View>
  );
}

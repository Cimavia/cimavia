import { InvitationStatus, invitationEmailOf } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useCreateInvitation, useInvitations } from "@/feature/athlete";
import { CmvButton, CmvText } from "@/shared/component";
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
 * preuve que le geste a porté, le mobile n'ayant pas de toasts. Les refusées restent au web.
 */
export function InvitationSection() {
  const { t } = useTranslation();
  const { data: invitations } = useInvitations();
  const create = useCreateInvitation();
  const [email, setEmail] = useState("");

  // `null` tant que la saisie n'est pas une adresse : le bouton reste fermé, et l'API ne voit
  // jamais partir ce qu'elle refuserait d'un message de validation brut (#319).
  const target = invitationEmailOf(email);
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
      />

      <CmvButton
        label={create.isPending ? t("athlete.invite.creating") : t("athlete.invite.action")}
        onPress={() => {
          if (target == null) return;
          // Le champ ne se vide qu'au succès : un échec laisse l'adresse à corriger, pas à retaper.
          create.mutate({ email: target }, { onSuccess: () => setEmail("") });
        }}
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
            <View key={invitation.id} className="gap-1 border-cmv-border border-t pt-2">
              {/* L'adresse EST l'invitation : c'est elle seule qui dit à qui elle apparaîtra. Une
                  ancienne invitation sans adresse reste lisible (règle dure n°5). */}
              <CmvText className="text-cmv-text-hi">{invitation.email ?? "—"}</CmvText>
              <CmvText className="text-cmv-text-lo text-xs">
                {t("athlete.invite.expires", { date: formatDateTime(invitation.expiresAt) })}
              </CmvText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

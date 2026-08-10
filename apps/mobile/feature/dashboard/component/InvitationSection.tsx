import { InvitationStatus } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Share, View } from "react-native";
import { useCreateInvitation, useInvitations } from "@/feature/athlete";
import { CmvButton, CmvText } from "@/shared/component";

/**
 * Invitation d'un athlète : le coach émet un code, l'athlète le saisit dans « Mon coach ».
 *
 * Un seul code affiché — le plus récent encore en attente — et non la liste complète du web : sur
 * un téléphone, ce qu'on veut c'est **transmettre le code là, maintenant**, pas administrer un
 * historique. Le suivi des invitations reste sur le web.
 *
 * Le partage passe par `Share` (React Native), pas par le presse-papier : `expo-clipboard` n'est
 * pas une dépendance du projet, et partager couvre le cas réel (SMS, WhatsApp) mieux qu'un copier
 * qui oblige à changer d'app à la main. « Copier le code » de la maquette attend donc cette
 * dépendance — écart assumé, pas un oubli.
 */
export function InvitationSection() {
  const { t } = useTranslation();
  const { data: invitations } = useInvitations();
  const create = useCreateInvitation();

  // L'API rend les invitations les plus récentes d'abord : la première en attente est la bonne.
  const pending = (invitations ?? []).find(
    (invitation) => invitation.status === InvitationStatus.PENDING,
  );

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("athlete.invite.title")}</CmvText>

      {pending == null ? (
        <CmvText className="text-cmv-text-lo text-sm">{t("athlete.invite.description")}</CmvText>
      ) : (
        <View className="gap-1">
          <CmvText className="font-cmv-display text-2xl text-cmv-text-hi tracking-widest">
            {pending.code}
          </CmvText>
          <CmvText className="text-cmv-text-lo text-xs">{t("athlete.invite.pending")}</CmvText>
        </View>
      )}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <CmvButton
            label={create.isPending ? t("athlete.invite.creating") : t("athlete.invite.action")}
            onPress={() => create.mutate({})}
            disabled={create.isPending}
          />
        </View>
        {pending == null ? null : (
          <View className="flex-1">
            <CmvButton
              label={t("athlete.invite.share")}
              onPress={() => {
                void Share.share({ message: t("athlete.invite.message", { code: pending.code }) });
              }}
            />
          </View>
        )}
      </View>

      {create.isError ? (
        <CmvText className="text-cmv-error text-sm">{t("athlete.invite.error")}</CmvText>
      ) : null}
    </View>
  );
}

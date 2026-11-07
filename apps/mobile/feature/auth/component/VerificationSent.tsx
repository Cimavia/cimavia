import { type ResendState, resendOutcome } from "@cmv/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { authClient } from "@/shared/lib/auth";

/**
 * Ce qui suit une inscription réussie depuis #270 : pas de session, un e-mail à ouvrir.
 *
 * Le texte ne dit PAS « ton compte est créé » : l'API répond pareil à une adresse déjà inscrite,
 * dont le propriétaire reçoit un autre e-mail. Dans les deux cas, il y a un e-mail à ouvrir et une
 * connexion ensuite.
 *
 * Le lien de l'e-mail mène à la page WEB, pas à un deep link : il s'ouvre souvent sur un autre
 * appareil, comme celui de la réinitialisation. Le renvoi part sans `callbackURL` — c'est l'API qui
 * décide où le lien ramène.
 */
export function VerificationSent({ email }: Readonly<{ email: string }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const [resend, setResend] = useState<ResendState>("idle");

  async function onResend() {
    setResend("sending");
    setResend(await resendOutcome(() => authClient.sendVerificationEmail({ email })));
  }

  return (
    <View className="gap-4">
      <CmvText className="text-cmv-text-mid">{t("auth.verificationSent.body", { email })}</CmvText>
      {resend === "sent" && (
        <CmvText className="text-cmv-text-mid">{t("auth.verificationSent.resent")}</CmvText>
      )}
      {resend === "failed" && (
        <CmvText className="text-cmv-error">{t("auth.errors.generic")}</CmvText>
      )}
      <CmvButton
        label={
          resend === "sending"
            ? t("auth.verificationSent.resending")
            : t("auth.verificationSent.resend")
        }
        onPress={onResend}
        disabled={resend === "sending"}
      />
      <Pressable onPress={() => router.push("/login")} className="items-center py-2">
        <CmvText className="font-semibold text-cmv-accent">
          {t("auth.verificationSent.toLogin")}
        </CmvText>
      </Pressable>
    </View>
  );
}

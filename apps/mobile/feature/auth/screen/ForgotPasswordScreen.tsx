import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

/**
 * Origine de l'app WEB, où atterrit le lien de réinitialisation (#64).
 *
 * On vise la page web et non un deep link `cimavia://` : un lien de réinitialisation s'ouvre dans
 * le client mail, souvent depuis un autre appareil que le téléphone — un scheme natif n'y résout
 * rien, et l'utilisateur resterait devant une page morte.
 *
 * ⚠️ Cette origine doit figurer dans le `CORS_ORIGINS` de l'API. Better Auth valide `redirectTo`
 * contre ses `trustedOrigins` et refuse une origine inconnue : le web s'en sort sans y penser
 * parce qu'il envoie la SIENNE, le mobile en envoie une tierce.
 *
 * La barre oblique finale est retirée : la valeur vient d'une variable d'environnement copiée à la
 * main, et `https://app.cimavia.fr/` produirait un `//reset-password` que le routeur web ignore.
 */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/+$/, "");

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // On confirme toujours, même sur une adresse inconnue : une réponse différente révélerait
      // quels comptes existent.
      const { error: requestError } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${WEB_URL}/reset-password`,
      });
      /**
       * Le client Better Auth NE LÈVE PAS sur une réponse d'erreur : il la rend. Sans cette
       * lecture, un refus s'afficherait « e-mail envoyé » — et c'est le refus le plus probable ici,
       * `requestPasswordReset` validant `redirectTo` contre ses `trustedOrigins` (`originCheck`).
       *
       * Cela ne rouvre PAS l'énumération d'adresses : une adresse inconnue reçoit `status: true`
       * sans erreur, exactement comme une adresse connue. Seule une panne se distingue.
       */
      if (requestError != null) {
        setError(t("auth.errors.generic"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cmv-bg-0 p-6">
      <CmvText className="mb-2 font-cmv-display text-cmv-title text-cmv-text-hi">
        {t("auth.forgot.title")}
      </CmvText>
      {sent ? (
        <CmvText className="text-cmv-text-mid">{t("auth.forgot.sent")}</CmvText>
      ) : (
        <>
          <CmvText className="text-cmv-text-mid">{t("auth.forgot.description")}</CmvText>
          <CmvTextField
            label={t("common.email")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {error != null && <CmvText className="text-cmv-error">{error}</CmvText>}
          <CmvButton
            label={submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
            onPress={onSubmit}
            disabled={submitting}
          />
        </>
      )}
      <Pressable onPress={() => router.push("/login")}>
        <CmvText className="text-cmv-accent">{t("auth.forgot.back")}</CmvText>
      </Pressable>
    </View>
  );
}

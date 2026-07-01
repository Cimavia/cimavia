import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

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
      // Le lien de reset (envoyé par e-mail, loggé côté API en MOCKED) ouvre la page web /reset-password.
      await authClient.requestPasswordReset({ email });
      setSent(true);
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cmv-bg-0">
      <View className="flex-1 justify-center gap-4 p-6">
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
    </SafeAreaView>
  );
}

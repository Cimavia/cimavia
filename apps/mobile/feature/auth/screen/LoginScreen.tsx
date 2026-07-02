import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session != null) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError != null) {
        setError(t("auth.errors.invalidCredentials"));
        return;
      }
      router.replace("/home");
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cmv-bg-0 p-6">
      <CmvText className="mb-2 font-cmv-display text-cmv-title text-cmv-text-hi">
        {t("auth.login.title")}
      </CmvText>
      <CmvTextField
        label={t("common.email")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <CmvTextField
        label={t("common.password")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />
      {error != null && <CmvText className="text-cmv-error">{error}</CmvText>}
      <CmvButton
        label={submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        onPress={onSubmit}
        disabled={submitting}
      />
      <Pressable onPress={() => router.push("/forgot-password")}>
        <CmvText className="text-cmv-text-mid">{t("auth.login.forgot")}</CmvText>
      </Pressable>
      <View className="flex-row gap-1">
        <CmvText className="text-cmv-text-mid">{t("auth.login.noAccount")}</CmvText>
        <Pressable onPress={() => router.push("/register")}>
          <CmvText className="text-cmv-accent">{t("auth.login.toRegister")}</CmvText>
        </Pressable>
      </View>
    </View>
  );
}

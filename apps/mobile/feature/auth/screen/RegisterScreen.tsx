import { Role, type RoleType } from "@cmv/shared";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

const SELECTABLE_ROLES: RoleType[] = [Role.COACH, Role.ATHLETE];

export function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleType>(Role.ATHLETE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session != null) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({ email, password, name, role });
      if (signUpError != null) {
        setError(t("auth.errors.generic"));
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
    <SafeAreaView className="flex-1 bg-cmv-bg-0">
      <View className="flex-1 justify-center gap-4 p-6">
        <CmvText className="mb-2 font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("auth.register.title")}
        </CmvText>
        <CmvTextField label={t("auth.register.name")} value={name} onChangeText={setName} />
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
          autoComplete="new-password"
        />
        <View className="gap-1">
          <CmvText className="text-cmv-text-mid text-sm">{t("auth.register.role")}</CmvText>
          <View className="flex-row gap-2">
            {SELECTABLE_ROLES.map((value) => (
              <Pressable
                key={value}
                onPress={() => setRole(value)}
                className={
                  role === value
                    ? "flex-1 rounded-lg border border-cmv-accent bg-cmv-accent-soft px-3 py-3"
                    : "flex-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3"
                }
              >
                <CmvText className="text-center text-cmv-text-hi">
                  {value === Role.COACH ? t("role.coach") : t("role.athlete")}
                </CmvText>
              </Pressable>
            ))}
          </View>
        </View>
        {error != null && <CmvText className="text-cmv-error">{error}</CmvText>}
        <CmvButton
          label={submitting ? t("auth.register.submitting") : t("auth.register.submit")}
          onPress={onSubmit}
          disabled={submitting}
        />
        <View className="flex-row gap-1">
          <CmvText className="text-cmv-text-mid">{t("auth.register.hasAccount")}</CmvText>
          <Pressable onPress={() => router.push("/login")}>
            <CmvText className="text-cmv-accent">{t("auth.register.toLogin")}</CmvText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

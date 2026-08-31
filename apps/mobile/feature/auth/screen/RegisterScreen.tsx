import type { CapabilityName } from "@cmv/shared";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { authClient } from "@/shared/lib/auth";
import { landingTab } from "@/shared/lib/tabs";

/**
 * Les capacités proposées à l'inscription. Cumulables (#7) : un coach qui se coache lui-même coche
 * les deux. `role` n'est plus envoyé — l'API le déduit comme persona d'atterrissage (#12).
 */
const SELECTABLE_CAPABILITIES: { name: CapabilityName; labelKey: string }[] = [
  { name: "coach", labelKey: "auth.register.capabilityCoach" },
  { name: "athlete", labelKey: "auth.register.capabilityAthlete" },
];

/** Bascule une capacité sans muter l'état existant (React compare par référence). */
function toggled(current: Set<CapabilityName>, name: CapabilityName): Set<CapabilityName> {
  const next = new Set(current);
  if (!next.delete(name)) next.add(name);
  return next;
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const capabilities = useCapabilities();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<CapabilityName>>(new Set(["athlete"]));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session != null) {
    // Destination DÉRIVÉE de la capacité, comme sur l'écran d'entrée : `/planning` en dur
    // envoyait un coach sur `GET /me/plan`, qui est `@Roles([ATHLETE])`.
    return <Redirect href={landingTab(capabilities) ?? "/login"} />;
  }

  async function onSubmit() {
    // Garde côté client EN PLUS de celle de l'API (400) : un compte sans capacité se retrouverait
    // devant une application vide, et le dire ici évite un aller-retour pour l'apprendre.
    if (selected.size === 0) {
      setError(t("auth.errors.noCapability"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        isCoach: selected.has("coach"),
        isAthlete: selected.has("athlete"),
      });
      if (signUpError != null) {
        // 422 (UNPROCESSABLE_ENTITY) = e-mail déjà utilisé : seul 422 du sign-up côté Better Auth
        // (les autres validations sont des 400). Cf. web RegisterScreen.
        const emailInUse = signUpError.status === 422;
        setError(t(emailInUse ? "auth.errors.emailInUse" : "auth.errors.generic"));
        return;
      }
      router.replace("/planning");
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cmv-bg-0 p-6">
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
        <CmvText className="text-cmv-text-mid text-sm">{t("auth.register.capabilities")}</CmvText>
        <View className="flex-row gap-2">
          {SELECTABLE_CAPABILITIES.map(({ name, labelKey }) => {
            const checked = selected.has(name);
            return (
              <Pressable
                key={name}
                onPress={() => setSelected(toggled(selected, name))}
                // Case à cocher et non bouton : ce sont deux choix INDÉPENDANTS, et VoiceOver doit
                // l'annoncer ainsi — sans quoi rien ne dit qu'on peut cocher les deux.
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className={
                  checked
                    ? "flex-1 rounded-lg border border-cmv-accent bg-cmv-accent-soft px-3 py-3"
                    : "flex-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3"
                }
              >
                <CmvText className="text-center text-cmv-text-hi">{t(labelKey)}</CmvText>
              </Pressable>
            );
          })}
        </View>
        <CmvText className="text-cmv-text-lo text-xs">{t("auth.register.capabilityHint")}</CmvText>
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
  );
}

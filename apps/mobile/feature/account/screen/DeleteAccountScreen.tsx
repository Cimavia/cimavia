import {
  capabilitiesOf,
  type ErasureFailure,
  type ErasureNotices,
  eraseAccountSchema,
  erasureFailureOf,
  erasureNotices,
  isUnauthorizedError,
  PASSWORD_MAX_LENGTH,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkState } from "expo-network";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAccountErasure } from "@/feature/account/hook/useAccountErasure";
import { CmvButton, CmvScreen, CmvText, CmvWarningNotice } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";

// i18n-values account.delete.gone: coach, athlete, company
// i18n-values account.delete.kept: coach, athlete
// i18n-values account.delete.failure: wrongPassword, tooManyAttempts, busy, sessionLost, generic

type DeleteFailure = ErasureFailure | "sessionLost" | "generic";

/** Le mobile n'a pas de reconnexion sur place (#439) : un 401 doit se dire ici. */
function failureOf(error: unknown): DeleteFailure | null {
  if (error == null) return null;
  return erasureFailureOf(error) ?? (isUnauthorizedError(error) ? "sessionLost" : "generic");
}

function NoticeSection({ title, items }: Readonly<{ title: string; items: readonly string[] }>) {
  return (
    <View className="gap-2">
      <CmvText className="font-cmv-display text-cmv-text-hi text-lg">{title}</CmvText>
      {items.map((item) => (
        <View key={item} className="flex-row gap-2">
          <View className="mt-2 h-1 w-1 rounded-full bg-cmv-text-mid" />
          <CmvText className="flex-1 text-cmv-text-mid text-sm">{item}</CmvText>
        </View>
      ))}
    </View>
  );
}

/**
 * Supprimer son compte (#796) : ce qui part, ce qui reste, puis le mot de passe.
 *
 * Seul un mot de passe refusé vide le champ : après un « réessaie dans un instant » ou une panne,
 * le mot de passe est bon, le faire retaper ne servirait à rien.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const network = useNetworkState();
  const [password, setPassword] = useState("");
  const erase = useAccountErasure();
  // `busy` vient du rendu : un double appui le devance, et le second POST prendrait la main sur le
  // premier, jusqu'à afficher un refus sur un compte déjà parti.
  const submitted = useRef(false);

  // Retenues dès la première session vue, tant que l'écran vit : la purge efface la session avant
  // la navigation, et ni le texte ni la garde ci-dessous ne doivent le remarquer.
  const [notices, setNotices] = useState<ErasureNotices | null>(null);
  if (session != null && notices == null) {
    setNotices(erasureNotices(capabilitiesOf(session.user)));
    return null;
  }

  if (notices == null) {
    if (!isPending) return <Redirect href="/login" />;
    return (
      <View className="flex-1 items-center justify-center bg-cmv-bg-0">
        <ActivityIndicator />
      </View>
    );
  }

  const failure = failureOf(erase.error);
  // Reste éteint après le succès : l'écran est en train d'être quitté.
  const busy = erase.isPending || erase.isSuccess;
  const valid = eraseAccountSchema.safeParse({ password }).success;
  // Indéterminé au premier rendu : on ne bloque le geste que sur une absence certaine de réseau.
  const offline = network.isInternetReachable === false;

  function onSubmit() {
    if (submitted.current) return;
    submitted.current = true;
    erase.mutate(
      { password },
      {
        onError: (error) => {
          if (erasureFailureOf(error) === "wrongPassword") setPassword("");
        },
        onSettled: () => {
          submitted.current = false;
        },
      },
    );
  }

  return (
    <CmvScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View className="flex-row items-center gap-3 border-cmv-border border-b px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            className="rounded-lg border border-cmv-border bg-cmv-surface p-2"
          >
            <Ionicons name="chevron-back" size={18} color={cmvColors.text.hi} />
          </Pressable>
          <CmvText className="flex-1 font-cmv-display text-cmv-text-hi" numberOfLines={1}>
            {t("account.delete.title")}
          </CmvText>
        </View>

        <ScrollView contentContainerClassName="gap-6 p-4" keyboardShouldPersistTaps="handled">
          <CmvWarningNotice>{t("account.delete.warning")}</CmvWarningNotice>
          <NoticeSection
            title={t("account.delete.goneTitle")}
            items={notices.gone.map((name) => t(`account.delete.gone.${name}`))}
          />
          <NoticeSection
            title={t("account.delete.keptTitle")}
            items={[
              ...notices.kept.map((name) => t(`account.delete.kept.${name}`)),
              t("account.delete.backups"),
            ]}
          />

          <View className="gap-3">
            <CmvTextField
              label={t("common.password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              maxLength={PASSWORD_MAX_LENGTH}
            />
            {offline && (
              <CmvText className="text-cmv-warning-on text-sm">
                {t("account.delete.offline")}
              </CmvText>
            )}
            {failure != null && (
              <CmvText className="text-cmv-error text-sm">
                {t(`account.delete.failure.${failure}`)}
              </CmvText>
            )}
            <CmvButton
              variant="danger"
              label={busy ? t("account.delete.submitting") : t("account.delete.submit")}
              onPress={onSubmit}
              disabled={!valid || busy || offline}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </CmvScreen>
  );
}

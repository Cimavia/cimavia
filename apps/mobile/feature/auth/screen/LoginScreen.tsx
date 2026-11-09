import { signInErrorKey } from "@cmv/shared";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { landingTab } from "@/shared/lib/tabs";
export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const capabilities = useCapabilities();
  // Posé par la suppression du compte (#796) : on arrive ici sans rien d'autre pour le confirmer.
  const { erased } = useLocalSearchParams<{ erased?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Le serveur a répondu qu'il n'y a personne, panne réseau exclue : ce que l'appareil garde du
  // compte précédent n'a plus de raison d'attendre la prochaine connexion (SC-7). Un échec se
  // rattrape à cette connexion, qui repurge.
  const noSessionConfirmed = !isPending && session == null && sessionError == null;
  useEffect(() => {
    if (noSessionConfirmed) resetAccountData().catch(() => {});
  }, [noSessionConfirmed]);

  if (!isPending && session != null) {
    // Destination DÉRIVÉE de la capacité, comme sur l'écran d'entrée : `/planning` en dur
    // envoyait un coach sur `GET /me/plans`, qui est `@Roles([ATHLETE])`.
    return <Redirect href={landingTab(capabilities)} />;
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError != null) {
        // `EMAIL_NOT_VERIFIED` : l'adresse n'est pas confirmée, l'API vient de renvoyer le lien (#270).
        setError(t(signInErrorKey(signInError)));
        return;
      }
      // Le seul point de passage OBLIGÉ d'un changement de compte : une session expirée ramène
      // ici sans qu'aucune déconnexion soit passée, et le cache du précédent serait resservi.
      await resetAccountData();
      // AUCUNE navigation ici : c'est la garde de session en tête de ce composant qui aiguille,
      // une fois la session RÉSOLUE, vers l'onglet que la capacité autorise. Un `replace` en dur
      // partait avant elle et sur une route athlète — un compte dont la session n'avait pas encore
      // repris se voyait alors refuser `/planning` par `redirectForPath`, qui le déposait sur le
      // premier onglet sans capacité (Messages) avec une barre amputée de la moitié de ses
      // entrées. Le commentaire de la garde disait déjà pourquoi `/planning` en dur est faux.
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
      {erased != null && (
        <CmvText className="text-cmv-text-mid">{t("account.deleted.message")}</CmvText>
      )}
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

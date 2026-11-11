import { signInErrorKey } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { useHardwareBackLock } from "@/shared/hook/useHardwareBackLock";
import { type SessionOwner, useSessionDeparture } from "@/shared/hook/useSessionGuard";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

/**
 * La reconnexion SUR PLACE (#439), posée par `SessionGuard` quand la session tombe sous un écran
 * ouvert : pendant mobile de celle du web (#336).
 *
 * Elle recouvre l'écran sans le démonter : renvoyer vers `/login` jetterait le Feedback en cours,
 * son texte et ses médias sélectionnés. Le voile est OPAQUE, et l'e-mail n'est pas saisissable : on
 * ne reprend l'écran que sous le compte qui l'a ouvert, et celui qui trouve le téléphone ne doit
 * pas lire ce qu'il y a dessous.
 *
 * Une vue plein écran et non une `Modal` : iOS présente mal une modale par-dessus une autre. Une
 * `Modal` déjà ouverte reste donc au-dessus jusqu'à sa fermeture : la fenêtre apparaît alors.
 */
export function ReauthOverlay({ owner }: Readonly<{ owner: SessionOwner }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const departure = useSessionDeparture();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const busy = submitting || leaving;

  // Retour sortirait de l'écran que le voile est là pour garder.
  useHardwareBackLock(true);
  // Le clavier de l'écran du dessous resterait ouvert sur un champ qu'on ne voit plus.
  useEffect(() => Keyboard.dismiss(), []);

  async function leaveForLogin() {
    // Une reconnexion lancée pendant la purge rentrerait dans un cache vide, puis repartirait.
    setLeaving(true);
    // Une purge qui résiste ne doit pas enfermer sous le voile : la connexion repurgera.
    await resetAccountData().catch(() => {});
    router.replace("/login");
    departure.complete();
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email: owner.email,
        password,
      });
      if (signInError != null) {
        setError(t(signInErrorKey(signInError)));
        return;
      }
      // L'e-mail a pu changer de compte entre-temps : un autre identifiant ne reprend pas l'écran.
      if (data?.user.id !== owner.id) {
        await leaveForLogin();
        return;
      }
      // Les lectures tombées en 401 pendant la perte restent en erreur jusqu'à leur prochain
      // chargement : l'écran doit être juste une fois le voile parti.
      await queryClient.invalidateQueries();
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="absolute inset-0 bg-cmv-bg-0" accessibilityViewIsModal>
      {/* `style` et non `className` : NativeWind n'interprète que les composants de React Native. */}
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "center" }} behavior="padding">
        <View className="gap-4 p-6">
          <CmvText className="font-cmv-display text-cmv-title text-cmv-text-hi">
            {t("auth.reauth.title")}
          </CmvText>
          <CmvText className="text-cmv-text-mid">{t("auth.reauth.body")}</CmvText>
          <CmvText className="text-cmv-text-mid">
            {t("auth.reauth.account")} <CmvText className="text-cmv-text-hi">{owner.email}</CmvText>
          </CmvText>
          <CmvTextField
            label={t("common.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          {error != null && <CmvText className="text-cmv-error">{error}</CmvText>}
          <CmvButton
            label={submitting ? t("auth.login.submitting") : t("auth.reauth.submit")}
            onPress={onSubmit}
            disabled={busy}
          />
          <Pressable onPress={leaveForLogin} disabled={busy}>
            <CmvText className="text-center text-cmv-text-mid">
              {t("auth.reauth.switchAccount")}
            </CmvText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

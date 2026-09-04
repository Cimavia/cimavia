import { type CapabilityName, capabilitiesOf } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import {
  capabilityErrorKey,
  useCapabilityUpdate,
} from "@/feature/account/hook/useCapabilityUpdate";
import { NotificationEmailSection, revokeCurrentPushToken } from "@/feature/notification";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";
import { resetQueryCache } from "@/shared/lib/query";

// i18n-values account.capabilities.option: coach, athlete
// i18n-values account.capabilities.hint: coach, athlete
const OPTIONS: readonly CapabilityName[] = ["coach", "athlete"];

// Profil : point d'entrée du compte. Langue et coach viendront ici.
export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, refetch } = authClient.useSession();
  const current = capabilitiesOf(session?.user);

  const [selected, setSelected] = useState<Set<CapabilityName>>(
    new Set(OPTIONS.filter((name) => (name === "coach" ? current.isCoach : current.isAthlete))),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useCapabilityUpdate(() => {
    setError(null);
    // La barre d'onglets et l'espace courant dérivent tous deux de la session : la redemander
    // suffit à les recalculer, sans navigation ni rechargement.
    void refetch();
  });

  const isCoach = selected.has("coach");
  const isAthlete = selected.has("athlete");
  const unchanged = isCoach === current.isCoach && isAthlete === current.isAthlete;

  function toggle(name: CapabilityName) {
    const next = new Set(selected);
    if (!next.delete(name)) next.add(name);
    setSelected(next);
    setError(null);
  }

  function onSave() {
    update.mutate(
      { isCoach, isAthlete },
      { onError: (cause) => setError(t(capabilityErrorKey(cause))) },
    );
  }

  async function onLogout() {
    // Détacher l'appareil AVANT de fermer la session : la route de révocation est scopée à
    // l'utilisateur connecté, elle n'aurait plus d'effet après le signOut.
    await revokeCurrentPushToken();
    await authClient.signOut();
    // Le cookie part, le cache RESTAIT — persisté sept jours et frais cinq minutes, il était
    // resservi tel quel au compte suivant sur cet appareil.
    await resetQueryCache();
    router.replace("/login");
  }

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        <View className="gap-1">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {session?.user.name ?? "—"}
          </CmvText>
          <CmvText className="text-cmv-text-mid">{session?.user.email ?? "—"}</CmvText>
        </View>

        <View className="gap-2">
          <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
            {t("account.capabilities.title")}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-sm">
            {t("account.capabilities.description")}
          </CmvText>

          {OPTIONS.map((name) => {
            const checked = selected.has(name);
            return (
              <Pressable
                key={name}
                onPress={() => toggle(name)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className={
                  checked
                    ? "gap-1 rounded-lg border border-cmv-accent bg-cmv-accent-soft p-3"
                    : "gap-1 rounded-lg border border-cmv-border bg-cmv-surface p-3"
                }
              >
                <CmvText className="text-cmv-text-hi">
                  {t(`account.capabilities.option.${name}`)}
                </CmvText>
                <CmvText className="text-cmv-text-mid text-sm">
                  {t(`account.capabilities.hint.${name}`)}
                </CmvText>
              </Pressable>
            );
          })}

          {/* L'avertissement ne s'affiche QUE sur un retrait effectif : rappeler ce qu'on garde
              n'a de sens qu'au moment où l'on s'apprête à le perdre de vue. */}
          {current.isCoach && !isCoach && (
            // Couleurs d'avertissement du design system (mêmes tokens que le variant `warning` de
            // CmvBadge) : ce n'est pas une note d'information, c'est ce qu'on s'apprête à perdre
            // de vue.
            <View className="flex-row items-center gap-2 rounded-lg border border-cmv-warning-line bg-cmv-warning-soft p-3">
              <Ionicons name="warning-outline" size={18} color={cmvColors.warning.on} />
              <CmvText className="flex-1 text-cmv-warning-on text-sm">
                {t("account.capabilities.warnCoach")}
              </CmvText>
            </View>
          )}
          {!isCoach && !isAthlete && (
            <CmvText className="text-cmv-error text-sm">
              {t("account.capabilities.atLeastOne")}
            </CmvText>
          )}
          {error != null && <CmvText className="text-cmv-error text-sm">{error}</CmvText>}

          <CmvButton
            label={update.isPending ? t("common.saving") : t("common.save")}
            onPress={onSave}
            disabled={unchanged || (!isCoach && !isAthlete) || update.isPending}
          />
        </View>

        {/* La ligne « Notifications » de la maquette (`athlete_profile.dc.html`), remplie sur
            place (#66). Quatre interrupteurs tiennent dans la page : un lien vers un écran qui
            n'aurait contenu qu'eux ferait payer une navigation pour rien. */}
        <NotificationEmailSection />

        <CmvButton label={t("common.logout")} onPress={onLogout} />
      </ScrollView>
    </CmvScreen>
  );
}

import {
  EMAILABLE_NOTIFICATION_TYPES,
  NOTIFICATION_SETTING_LABEL_KEY,
  toggledPreferences,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { useTranslation } from "react-i18next";
import { ScrollView, Switch, View } from "react-native";
import {
  useNotificationPreferences,
  useToggleNotificationPreference,
} from "@/feature/notification/hook/useNotificationPreferences";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";

/**
 * Réglages des notifications par e-mail (#66) — la destination qui manquait à la ligne
 * « Notifications » du profil (maquette `athlete_profile.dc.html`).
 *
 * **Bascule immédiate, pas de bouton « Enregistrer ».** L'API attend l'ENSEMBLE des types activés,
 * donc chaque geste envoie un état complet et idempotent, jamais un delta qui pourrait s'appliquer
 * deux fois. C'est aussi la grammaire d'un réglage de notification partout ailleurs.
 *
 * `Switch` de React Native plutôt qu'un `Pressable` habillé, contrairement aux capacités du
 * profil : c'est le contrôle natif de ce geste, il porte son rôle d'accessibilité sans qu'on ait
 * à le déclarer, et il reste éprouvable par le harnais de rendu — là où `accessibilityState` est
 * invisible de `react-native-web` (dette Q-6). Ses couleurs viennent de `cmvColors`, seule
 * dérogation prévue à la règle des classes (une API native exige une valeur, pas un className).
 */
export function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const { data: grid, isError, refetch } = useNotificationPreferences();
  const toggle = useToggleNotificationPreference();

  // Toutes les lignes se ferment pendant l'écriture : chaque requête part de la grille affichée,
  // et deux écritures en vol pourraient revenir dans le désordre. Le verrou dure un aller-retour.
  const busy = toggle.isPending;

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <View className="gap-1">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {t("notification.setting.title")}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-sm">
            {t("notification.setting.description")}
          </CmvText>
        </View>

        {/* Rien pendant le chargement : c'est la convention des écrans mobiles (SessionsScreen,
            RemindersScreen…), qui distinguent l'attente — muette — de l'échec, qui se dit. */}
        {isError && <CmvErrorState onRetry={() => void refetch()} />}

        {grid != null && (
          <View className="gap-2">
            {EMAILABLE_NOTIFICATION_TYPES.map((type) => {
              const enabled = grid.find((row) => row.type === type)?.enabled === true;
              return (
                <View
                  key={type}
                  className="flex-row items-center justify-between gap-4 rounded-lg border border-cmv-border bg-cmv-surface p-3"
                >
                  <CmvText className="flex-1 text-cmv-text-hi">
                    {t(NOTIFICATION_SETTING_LABEL_KEY[type])}
                  </CmvText>
                  <Switch
                    value={enabled}
                    disabled={busy}
                    // L'ensemble est calculé ICI, depuis la grille affichée : c'est celle que
                    // l'utilisateur voit au moment du geste, et la seule qui ne soit pas déjà
                    // basculée par la mise à jour optimiste.
                    onValueChange={() =>
                      toggle.mutate({ type, enabled: toggledPreferences(grid, type) })
                    }
                    trackColor={{ false: cmvColors.border.DEFAULT, true: cmvColors.accent.line }}
                    thumbColor={enabled ? cmvColors.accent.DEFAULT : cmvColors.text.lo}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

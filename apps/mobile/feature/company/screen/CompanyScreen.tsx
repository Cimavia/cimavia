import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { useLogout } from "@/feature/account/hook/useLogout";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { WEB_URL } from "@/shared/lib/web-url";

/**
 * Ce que voit un compte Entreprise sur le téléphone : l'adresse de son espace, qui n'existe que sur
 * le web, et de quoi se déconnecter (#600). Ni onglets ni navigation : il n'a rien d'autre ici.
 */
export function CompanyScreen() {
  const { t } = useTranslation();
  const logout = useLogout();
  // L'adresse se lit mieux sans son protocole ; le lien, lui, l'emporte.
  const address = WEB_URL.replace(/^https?:\/\//, "");

  return (
    <CmvScreen className="justify-center p-6">
      <View className="items-center gap-6">
        <Ionicons name="desktop-outline" size={40} color={cmvColors.accent.on} />
        <CmvText className="text-center font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("company.mobile.title")}
        </CmvText>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(WEB_URL);
          }}
        >
          <CmvText className="font-cmv-mono text-cmv-accent">{address}</CmvText>
        </Pressable>
        <CmvButton label={t("common.logout")} onPress={logout} />
      </View>
    </CmvScreen>
  );
}

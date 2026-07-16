import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

// Profil de l'athlète : point d'entrée du compte. Factures (P6), coach et langue viendront ici.
export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function onLogout() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <CmvScreen>
      <View className="flex-1 gap-6 p-4">
        <View className="gap-1">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {session?.user.name ?? "—"}
          </CmvText>
          <CmvText className="text-cmv-text-mid">{session?.user.email ?? "—"}</CmvText>
        </View>

        <CmvButton label={t("common.logout")} onPress={onLogout} />
      </View>
    </CmvScreen>
  );
}

import { Role } from "@cmv/shared";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { authClient } from "@/shared/lib/auth";

// Accueil authentifié — affichage conditionné par le rôle (p1-4). Garde : renvoie au login si déconnecté.
export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (!isPending && session == null) {
    return <Redirect href="/login" />;
  }

  const isCoach = session?.user.role === Role.COACH;

  async function onLogout() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-cmv-bg-0 p-6">
      <CmvText className="font-cmv-display text-cmv-subtitle text-cmv-text-hi">
        {t("home.welcome", { name: session?.user.name })}
      </CmvText>
      <CmvText className="text-cmv-accent">
        {isCoach ? t("home.spaceCoach") : t("home.spaceAthlete")}
      </CmvText>
      <CmvText className="text-center text-cmv-text-mid">
        {isCoach ? t("home.coachHint") : t("home.athleteHint")}
      </CmvText>
      <View className="mt-4 w-full">
        <CmvButton label={t("home.logout")} onPress={onLogout} />
      </View>
    </View>
  );
}

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { CmvText } from "@/shared/component";

/** L'entrée vers la suppression du compte (#796), depuis le Profil comme l'écran Entreprise. */
export function DeleteAccountLink() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/delete-account")}
      accessibilityRole="button"
      className="items-center py-2"
    >
      <CmvText className="text-cmv-error-on">{t("account.delete.title")}</CmvText>
    </Pressable>
  );
}

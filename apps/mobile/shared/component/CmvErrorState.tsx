import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvButton } from "./CmvButton";
import { CmvText } from "./CmvText";

type CmvErrorStateProps = {
  onRetry: () => void;
};

/**
 * Échec de CHARGEMENT — à ne jamais confondre avec un état vide : « aucune séance planifiée »
 * (le coach n'a rien diffusé) et « la requête a échoué » (réseau, serveur) appellent des réactions
 * opposées. Les libellés sont ici plutôt qu'en props : ce message est le même partout, et l'athlète
 * en salle le verra surtout sans réseau.
 */
export function CmvErrorState({ onRetry }: Readonly<CmvErrorStateProps>) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 rounded-lg border border-cmv-error p-6">
      <CmvText className="text-cmv-error">{t("common.errorTitle")}</CmvText>
      <CmvText className="text-cmv-text-mid text-sm">{t("common.errorDescription")}</CmvText>
      <CmvButton label={t("common.retry")} onPress={onRetry} />
    </View>
  );
}

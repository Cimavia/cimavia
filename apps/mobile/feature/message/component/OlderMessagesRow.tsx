import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import type { OlderMessages } from "@/feature/message/hook/useOlderMessages";
import { CmvButton, CmvText } from "@/shared/component";

/**
 * La tête du fil (#77) — le PIED de la `FlatList` inversée : rien tant que tout va bien, un
 * indicateur pendant le chargement, une ligne et « Réessayer » quand il a échoué. Pas de
 * maquette : les tokens de légende du fil.
 *
 * La région annoncée est TOUJOURS montée : une région qui naît avec son contenu n'est pas lue
 * par TalkBack.
 */
export function OlderMessagesRow({ older }: Readonly<{ older: OlderMessages }>) {
  const { t } = useTranslation();
  const failed = older.failed && !older.loading;
  return (
    <View className="items-center gap-2 py-2">
      <View accessibilityLiveRegion="polite" className="items-center gap-1">
        {older.loading ? (
          <>
            <ActivityIndicator />
            <CmvText className="text-cmv-text-mid text-xs">{t("messages.older.loading")}</CmvText>
          </>
        ) : null}
        {failed ? (
          <CmvText className="text-center text-cmv-text-mid text-xs">
            {t("messages.older.error")}
          </CmvText>
        ) : null}
      </View>
      {failed ? <CmvButton label={t("common.retry")} onPress={older.retry} /> : null}
    </View>
  );
}

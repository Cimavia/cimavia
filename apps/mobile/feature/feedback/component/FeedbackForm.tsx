import { FEEDBACK_CONTENT_MAX_LENGTH } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvButton, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";

type FeedbackFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSaving: boolean;
  canSubmit: boolean;
};

/**
 * Le champ texte libre du débrief (CDC §5.6). Un seul champ, pas d'indicateur chiffré.
 * La longueur max vient du schéma partagé : le client borne la saisie AVANT que l'API rejette.
 */
export function FeedbackForm({
  value,
  onChange,
  onSubmit,
  isSaving,
  canSubmit,
}: Readonly<FeedbackFormProps>) {
  const { t } = useTranslation();

  return (
    <View className="gap-3">
      <CmvTextField
        label={t("feedback.contentLabel")}
        placeholder={t("feedback.contentPlaceholder")}
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
        editable={!isSaving}
      />
      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.contentHint")}</CmvText>

      <CmvButton
        label={isSaving ? t("feedback.saving") : t("feedback.save")}
        onPress={onSubmit}
        disabled={isSaving || !canSubmit}
      />
    </View>
  );
}

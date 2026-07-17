import { MediaType, type MediaTypeType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { CmvButton, CmvText } from "@/shared/component";

type MediaPickerProps = {
  photosLeft: number;
  videosLeft: number;
  onAdd: (type: MediaTypeType) => void;
  isUploading: boolean;
};

/**
 * Ajout de photos / vidéos. Les places restantes viennent des plafonds partagés (@cmv/shared) :
 * le bouton s'éteint AVANT que l'API réponde 409 — la règle est la même des deux côtés.
 */
export function MediaPicker({
  photosLeft,
  videosLeft,
  onAdd,
  isUploading,
}: Readonly<MediaPickerProps>) {
  const { t } = useTranslation();

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-text-mid text-xs">
        {t("feedback.media.remaining", { photos: photosLeft, videos: videosLeft })}
      </CmvText>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <CmvButton
            label={t("feedback.media.addPhoto")}
            onPress={() => onAdd(MediaType.IMAGE)}
            disabled={isUploading || photosLeft <= 0}
          />
        </View>
        <View className="flex-1">
          <CmvButton
            label={t("feedback.media.addVideo")}
            onPress={() => onAdd(MediaType.VIDEO)}
            disabled={isUploading || videosLeft <= 0}
          />
        </View>
      </View>

      {/* Un upload de 50 Mo en 4G prend du temps : sans indicateur, l'écran paraît figé. */}
      {isUploading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator />
          <CmvText className="text-cmv-text-mid text-xs">{t("feedback.media.uploading")}</CmvText>
        </View>
      ) : null}
    </View>
  );
}

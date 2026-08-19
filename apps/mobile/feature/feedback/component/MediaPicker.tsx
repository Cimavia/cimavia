import { MediaType, type MediaTypeType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { CmvAudioRecorder, CmvButton, CmvText, type RecordedAudio } from "@/shared/component";

type MediaPickerProps = {
  photosLeft: number;
  videosLeft: number;
  audiosLeft: number;
  onAdd: (type: MediaTypeType) => void;
  onRecordAudio: (audio: RecordedAudio) => void;
  onRecorderError: (reasonKey: string) => void;
  isUploading: boolean;
  /** Avancement de l'envoi en cours, 0-100. */
  progress: number;
};

/**
 * Ajout de photos / vidéos / notes vocales. Les places restantes viennent des plafonds partagés
 * (@cmv/shared) : le bouton s'éteint AVANT que l'API réponde 409 — la règle est la même des deux
 * côtés. La note vocale (P5) réutilise l'enregistreur de la messagerie.
 */
export function MediaPicker({
  photosLeft,
  videosLeft,
  audiosLeft,
  onAdd,
  onRecordAudio,
  onRecorderError,
  isUploading,
  progress,
}: Readonly<MediaPickerProps>) {
  const { t } = useTranslation();

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-text-mid text-xs">
        {t("feedback.media.remaining", {
          photos: photosLeft,
          videos: videosLeft,
          audios: audiosLeft,
        })}
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

      {/* Note vocale : l'enregistreur s'étend en bandeau pendant la capture. */}
      <View className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface px-4 py-2">
        <CmvText className="flex-1 text-cmv-text-mid text-sm">
          {t("feedback.media.addAudio")}
        </CmvText>
        <CmvAudioRecorder
          onRecorded={onRecordAudio}
          onError={onRecorderError}
          disabled={isUploading || audiosLeft <= 0}
        />
      </View>

      {/* Une vidéo longue en 4G prend des dizaines de secondes, et davantage encore depuis que
          l'envoi découpé lève le plafond : sans indicateur, l'écran paraît figé. */}
      {isUploading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator />
          <CmvText className="text-cmv-text-mid text-xs">
            {t("feedback.media.uploading", { percent: progress })}
          </CmvText>
        </View>
      ) : null}
    </View>
  );
}

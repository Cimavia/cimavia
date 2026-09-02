import type { MediaBatchStep } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { CmvAudioRecorder, CmvButton, CmvText, type RecordedAudio } from "@/shared/component";

type MediaPickerProps = {
  photosLeft: number;
  videosLeft: number;
  audiosLeft: number;
  onAddMedia: () => void;
  onRecordAudio: (audio: RecordedAudio) => void;
  onRecorderError: (reasonKey: string) => void;
  isUploading: boolean;
  /** Avancement de l'envoi en cours, 0-100. */
  progress: number;
  /** Le média en cours dans un lot, `null` hors envoi. */
  step: MediaBatchStep | null;
};

/**
 * Ajout de photos / vidéos / notes vocales. Les places restantes viennent des plafonds partagés
 * (@cmv/shared) : le bouton s'éteint AVANT que l'API réponde 409 — la règle est la même des deux
 * côtés. La note vocale (P5) réutilise l'enregistreur de la messagerie.
 *
 * UN seul bouton pour les photos et les vidéos depuis #156 : la sélection est multiple et mêlée,
 * et deux boutons obligeraient à deux allers-retours pour un lot mixte. C'est la ligne des places
 * restantes qui porte désormais la distinction entre les deux quotas.
 */
export function MediaPicker({
  photosLeft,
  videosLeft,
  audiosLeft,
  onAddMedia,
  onRecordAudio,
  onRecorderError,
  isUploading,
  progress,
  step,
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

      <CmvButton
        label={t("feedback.media.addMedia")}
        onPress={onAddMedia}
        disabled={isUploading || photosLeft + videosLeft <= 0}
      />

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
          l'envoi découpé lève le plafond : sans indicateur, l'écran paraît figé. Le rang n'est dit
          que s'il y a un rang à dire — « Envoi 1 / 1 » serait du bruit. */}
      {isUploading ? (
        <View className="gap-1">
          {step != null && step.total > 1 ? (
            <CmvText className="text-cmv-text-mid text-xs">
              {t("feedback.media.batchProgress", {
                index: step.index,
                total: step.total,
                fileName: step.fileName ?? t("feedback.media.unnamedFile"),
              })}
            </CmvText>
          ) : null}
          <View className="flex-row items-center gap-2">
            <ActivityIndicator />
            <CmvText className="text-cmv-text-mid text-xs">
              {t("feedback.media.uploading", { percent: progress })}
            </CmvText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

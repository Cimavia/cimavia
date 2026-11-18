import type { MediaBatchStep, MultipartRetry } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import {
  CmvAudioLimitNotice,
  CmvAudioRecorder,
  CmvButton,
  CmvText,
  type RecordedAudio,
} from "@/shared/component";

type MediaPickerProps = {
  photosLeft: number;
  videosLeft: number;
  audiosLeft: number;
  onAddMedia: () => void;
  onRecordAudio: (audio: RecordedAudio) => void;
  /**
   * Une capture vient de démarrer, lancée à la main (#858). C'est là, et non à chaque note reçue,
   * que l'écran efface ses erreurs : une note relayée au plafond ne doit pas taire l'échec d'envoi
   * de la précédente.
   */
  onCaptureStart: () => void;
  onRecorderError: (reasonKey: string) => void;
  isUploading: boolean;
  /** Avancement de l'envoi en cours, 0-100. */
  progress: number;
  /** Le réessai en cours, `null` tant que l'envoi avance normalement. */
  retry: MultipartRetry | null;
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
  onCaptureStart,
  onRecorderError,
  isUploading,
  progress,
  retry,
  step,
}: Readonly<MediaPickerProps>) {
  const { t } = useTranslation();
  // La note s'est arrêtée au plafond faute de relais (#856) : dit jusqu'au prochain enregistrement.
  const [limitReached, setLimitReached] = useState(false);

  return (
    <View className="gap-2">
      {/* Note vocale : l'enregistreur s'étend en bandeau pendant la capture. */}
      <View className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface px-4 py-2">
        <CmvText className="flex-1 text-cmv-text-mid text-sm">
          {t("feedback.media.addAudio")}
        </CmvText>
        <CmvAudioRecorder
          onRecorded={onRecordAudio}
          onRecordingChange={(recording) => {
            if (!recording) return;
            setLimitReached(false);
            onCaptureStart();
          }}
          onError={onRecorderError}
          disabled={isUploading || audiosLeft <= 0}
          maxDurationSeconds={FEEDBACK_MEDIA_PROFILE.audioMaxDurationSeconds}
          // Au plafond, la parole continue dans une note neuve tant que le débrief a de la place.
          notesLeft={audiosLeft}
          onLimitReached={() => setLimitReached(true)}
        />
      </View>

      <CmvAudioLimitNotice
        visible={limitReached}
        maxDurationSeconds={FEEDBACK_MEDIA_PROFILE.audioMaxDurationSeconds}
      />

      <CmvButton
        label={t("feedback.media.addMedia")}
        onPress={onAddMedia}
        disabled={isUploading || photosLeft + videosLeft <= 0}
      />

      {/* Les places restantes viennent APRÈS les deux gestes, et non avant : c'est une note de bas
          de bloc, qu'on lit quand un bouton s'est éteint — pas un préambule à traverser pour
          atteindre ce qu'on est venu faire. */}
      <CmvText className="text-cmv-text-mid text-xs">
        {t("feedback.media.remaining", {
          photos: photosLeft,
          videos: videosLeft,
          audios: audiosLeft,
        })}
      </CmvText>

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
            {/* Un réessai PREND la place du pourcentage : c'est lui qui explique pourquoi la
                barre n'avance plus. */}
            <CmvText className="text-cmv-text-mid text-xs">
              {retry == null
                ? t("feedback.media.uploading", { percent: progress })
                : t("feedback.media.retrying", {
                    attempt: retry.attempt,
                    max: retry.maxAttempts,
                  })}
            </CmvText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

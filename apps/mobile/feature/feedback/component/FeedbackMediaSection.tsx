import { MediaType, remainingMediaSlots, type SessionFeedbackDto } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { MediaGrid } from "@/feature/feedback/component/MediaGrid";
import { MediaPicker } from "@/feature/feedback/component/MediaPicker";
import {
  useAddFeedbackAudio,
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useFeedbackMedia";
import { MediaRejectedError } from "@/feature/feedback/util/media.util";
import { CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Un refus métier (fichier trop lourd, permission refusée) porte sa propre clé i18n ; une panne
 * technique garde le message de l'API. Les deux se disent — aucune ne se masque. Le refus de
 * l'enregistreur, qui précède l'upload, est porté à la main (`manualKey`).
 */
function mediaErrorMessage(error: unknown, manualKey: string | null, t: TFunction): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey, error.params);
  return apiErrorMessage(error) ?? t("feedback.media.uploadError");
}

type FeedbackMediaSectionProps = {
  sessionId: string;
  /** `null` tant qu'aucun débrief n'existe : les quotas partent alors du maximum. */
  feedback: SessionFeedbackDto | null;
};

/**
 * Photos, vidéos et audio d'un débrief. Autonome : les trois mutations et l'erreur d'ajout ne
 * servent qu'ici, l'écran n'a pas à les porter pour afficher son champ texte.
 */
export function FeedbackMediaSection({ sessionId, feedback }: Readonly<FeedbackMediaSectionProps>) {
  const { t } = useTranslation();
  const addMedia = useAddFeedbackMedia(sessionId);
  const addAudio = useAddFeedbackAudio(sessionId);
  const removeMedia = useDeleteFeedbackMedia(sessionId);

  // Refus de l'enregistreur (permission/durée) : précède l'upload, ne passe pas par une mutation.
  const [recorderErrorKey, setRecorderErrorKey] = useState<string | null>(null);

  const error = mediaErrorMessage(
    addMedia.error ?? addAudio.error ?? removeMedia.error,
    recorderErrorKey,
    t,
  );

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-sm">{t("feedback.media.title")}</CmvText>

      <MediaGrid
        media={feedback?.media ?? []}
        onRemove={(mediaId) => removeMedia.mutate(mediaId)}
        isRemoving={removeMedia.isPending}
      />

      <MediaPicker
        photosLeft={remainingMediaSlots(feedback, MediaType.IMAGE)}
        videosLeft={remainingMediaSlots(feedback, MediaType.VIDEO)}
        audiosLeft={remainingMediaSlots(feedback, MediaType.AUDIO)}
        onAdd={(type) => {
          setRecorderErrorKey(null);
          addMedia.mutate(type);
        }}
        onRecordAudio={(audio) => {
          setRecorderErrorKey(null);
          addAudio.mutate(audio);
        }}
        onRecorderError={setRecorderErrorKey}
        isUploading={addMedia.isPending || addAudio.isPending}
        progress={addMedia.isPending ? addMedia.progress : addAudio.progress}
      />

      {error == null ? null : <CmvText className="text-cmv-error text-sm">{error}</CmvText>}
    </View>
  );
}

import type {
  MediaRecapLine,
  MediaRecapReason,
  MediaRejection,
  SessionFeedbackDto,
} from "@cmv/shared";
import { MediaType, remainingMediaSlots } from "@cmv/shared";
import type { ImagePickerAsset } from "expo-image-picker";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { MediaGrid } from "@/feature/feedback/component/MediaGrid";
import { MediaPicker } from "@/feature/feedback/component/MediaPicker";
import {
  assetMediaType,
  pickFeedbackAssets,
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
  // Le refus de la GALERIE (permission), qui précède lui aussi tout envoi.
  const [pickErrorKey, setPickErrorKey] = useState<string | null>(null);
  // Ce qui n'a pas été joint au dernier lot, média par média (#156).
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  const photosLeft = remainingMediaSlots(feedback, MediaType.IMAGE);
  const videosLeft = remainingMediaSlots(feedback, MediaType.VIDEO);
  const audiosLeft = remainingMediaSlots(feedback, MediaType.AUDIO);

  /**
   * Une sélection entière, d'un seul geste. Le tri, la file et le récapitulatif sont tenus par
   * `sendMediaBatch` (@cmv/shared) : l'écran ne fournit que ce qui lui est propre — les places
   * restantes et les libellés de ses refus.
   */
  async function onAddMedia() {
    setRecorderErrorKey(null);
    setPickErrorKey(null);
    setRecap([]);

    let picked: ImagePickerAsset[];
    try {
      picked = await pickFeedbackAssets(photosLeft + videosLeft);
    } catch (error) {
      setPickErrorKey(
        error instanceof MediaRejectedError ? error.reasonKey : "feedback.media.uploadError",
      );
      return;
    }
    if (picked.length === 0) return; // sélection annulée : ce n'est pas une erreur

    setRecap(
      await addMedia.addAssets({
        items: picked,
        // Le lot ne peut pas dépasser ce que les quotas laissent : au-delà, inutile de compresser.
        maxItems: photosLeft + videosLeft,
        remaining: {
          [MediaType.IMAGE]: photosLeft,
          [MediaType.VIDEO]: videosLeft,
          [MediaType.AUDIO]: audiosLeft,
        },
        kindOf: assetMediaType,
        nameOf: (asset) => asset.fileName ?? null,
        rejectedReason,
        failureReason,
      }),
    );
  }

  const error = mediaErrorMessage(
    addAudio.error ?? removeMedia.error,
    recorderErrorKey ?? pickErrorKey,
    t,
  );

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-sm">{t("feedback.media.title")}</CmvText>

      <MediaGrid
        media={feedback?.media ?? []}
        sessionId={sessionId}
        onRemove={(mediaId) => removeMedia.mutate(mediaId)}
        isRemoving={removeMedia.isPending}
      />

      <MediaPicker
        photosLeft={photosLeft}
        videosLeft={videosLeft}
        audiosLeft={audiosLeft}
        onAddMedia={() => {
          void onAddMedia();
        }}
        onRecordAudio={(audio) => {
          setRecorderErrorKey(null);
          addAudio.mutate(audio);
        }}
        onRecorderError={setRecorderErrorKey}
        isUploading={addMedia.isUploading || addAudio.isPending}
        progress={addMedia.isUploading ? addMedia.progress : addAudio.progress}
        step={addMedia.step}
      />

      {recap.length === 0 ? null : (
        <View className="gap-1">
          <CmvText className="text-cmv-text-mid text-xs">{t("feedback.media.recapTitle")}</CmvText>
          {/* Le rang sert de clé : la liste est REMPLACÉE en entier à chaque lot, jamais
              réordonnée ni amputée — deux médias peuvent d'ailleurs porter le même nom. */}
          {recap.map((entry, index) => (
            <CmvText key={index} className="text-cmv-error text-sm">
              {`${entry.fileName ?? t("feedback.media.unnamedFile")} — ${reasonText(entry.reason, t)}`}
            </CmvText>
          ))}
        </View>
      )}

      {error == null ? null : <CmvText className="text-cmv-error text-sm">{error}</CmvText>}
    </View>
  );
}

function reasonText(reason: MediaRecapReason, t: TFunction): string {
  return "key" in reason ? t(reason.key, reason.params) : reason.message;
}

/**
 * Ce que dit un refus qui précède l'envoi. `tooMany` et `noSlot` disent la même chose ici, et c'est
 * exact : le plafond du lot EST la somme des places restantes. `unsupported` ne peut pas survenir —
 * la galerie ne rend que des images et des vidéos, et `assetMediaType` est total.
 */
function rejectedReason({ kind }: MediaRejection): MediaRecapReason {
  return {
    key: kind === MediaType.VIDEO ? "feedback.media.noSlotVideo" : "feedback.media.noSlotImage",
    params: {},
  };
}

function failureReason(error: unknown): MediaRecapReason {
  if (error instanceof MediaRejectedError) return { key: error.reasonKey, params: error.params };
  const message = apiErrorMessage(error);
  return message == null ? { key: "feedback.media.uploadError", params: {} } : { message };
}

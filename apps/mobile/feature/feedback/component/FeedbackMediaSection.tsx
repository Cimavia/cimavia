import type { BatchOutcome, SessionFeedbackDto } from "@cmv/shared";
import { MediaType, remainingMediaSlots, splitByRemainingSlots } from "@cmv/shared";
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

/**
 * Ce qu'un média écarté doit dire à l'athlète. La raison est STOCKÉE, pas traduite : un changement
 * de langue doit retraduire le récapitulatif, pas le figer dans celle d'avant.
 */
type RecapReason = { key: string; params: Record<string, string | number> } | { message: string };
type RecapLine = { fileName: string | null; reason: RecapReason };

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
  const [recap, setRecap] = useState<readonly RecapLine[]>([]);

  const photosLeft = remainingMediaSlots(feedback, MediaType.IMAGE);
  const videosLeft = remainingMediaSlots(feedback, MediaType.VIDEO);
  const audiosLeft = remainingMediaSlots(feedback, MediaType.AUDIO);

  /**
   * Une sélection entière, d'un seul geste. Rien n'est annulé en bloc : ce qui tient dans les
   * places restantes part, le reste est RÉCAPITULÉ avec sa raison. Renvoyer l'athlète dans sa
   * galerie parce que la sixième photo est de trop lui ferait refaire une sélection qu'il vient
   * de faire.
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

    const { accepted, rejected } = splitByRemainingSlots(
      picked.map((asset) => ({ kind: assetMediaType(asset), asset })),
      {
        [MediaType.IMAGE]: photosLeft,
        [MediaType.VIDEO]: videosLeft,
        [MediaType.AUDIO]: audiosLeft,
      },
    );

    const outcomes = await addMedia.addAssets(accepted.map((item) => item.asset));
    setRecap([
      ...rejected.map((item) => line(item.asset.fileName ?? null, noSlotReason(item.kind))),
      ...failedLines(outcomes),
    ]);
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

function reasonText(reason: RecapReason, t: TFunction): string {
  return "key" in reason ? t(reason.key, reason.params) : reason.message;
}

function line(fileName: string | null, reason: RecapReason): RecapLine {
  return { fileName, reason };
}

function noSlotReason(kind: MediaType): RecapReason {
  return {
    key: kind === MediaType.VIDEO ? "feedback.media.noSlotVideo" : "feedback.media.noSlotImage",
    params: {},
  };
}

// Les médias effectivement partis n'ont rien à dire : ils sont déjà dans la grille.
function failedLines(outcomes: readonly BatchOutcome<ImagePickerAsset>[]): RecapLine[] {
  return outcomes
    .filter((outcome) => outcome.error != null)
    .map((outcome) => line(outcome.item.fileName ?? null, uploadReason(outcome.error)));
}

function uploadReason(error: unknown): RecapReason {
  if (error instanceof MediaRejectedError) return { key: error.reasonKey, params: error.params };
  const message = apiErrorMessage(error);
  return message == null ? { key: "feedback.media.uploadError", params: {} } : { message };
}

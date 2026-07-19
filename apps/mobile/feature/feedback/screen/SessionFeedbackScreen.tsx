import { MediaType } from "@cmv/shared";
import { useLocalSearchParams } from "expo-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { FeedbackForm } from "@/feature/feedback/component/FeedbackForm";
import { MediaGrid } from "@/feature/feedback/component/MediaGrid";
import { MediaPicker } from "@/feature/feedback/component/MediaPicker";
import {
  remainingSlots,
  useAddFeedbackAudio,
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useFeedbackMedia";
import { useSessionFeedback, useUpsertFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { MediaRejectedError } from "@/feature/feedback/util/media.util";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Un refus métier (fichier trop lourd, permission refusée) porte sa propre clé i18n ; une panne
 * technique garde le message de l'API. Les deux se disent — aucune ne se masque. Le refus de
 * l'enregistreur, qui précède l'upload, est porté à la main (`manualKey`).
 */
function mediaErrorMessage(error: unknown, manualKey: string | null, t: TFunction): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey);
  return apiErrorMessage(error) ?? t("feedback.media.uploadError");
}

/**
 * Débrief d'une séance (p4-1) : un champ texte libre + photos/vidéos, que l'athlète peut
 * reprendre plus tard.
 *
 * Écrire exige le réseau (pas d'écriture différée en MVP — CDC §12) : contrairement à la lecture
 * de la séance, on ne prétend pas fonctionner hors-ligne. L'échec est dit, pas masqué.
 */
export function SessionFeedbackScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: feedback, isPending, isError, refetch } = useSessionFeedback(id);
  const upsert = useUpsertFeedback(id);
  const addMedia = useAddFeedbackMedia(id);
  const addAudio = useAddFeedbackAudio(id);
  const removeMedia = useDeleteFeedbackMedia(id);

  const [content, setContent] = useState("");
  // Refus de l'enregistreur (permission/durée) : précède l'upload, ne passe pas par une mutation.
  const [recorderErrorKey, setRecorderErrorKey] = useState<string | null>(null);

  // Le formulaire part de ce qui est déjà enregistré (débrief repris en plusieurs fois). On ne
  // resynchronise QUE sur l'identité du débrief chargé : réécrire à chaque render effacerait la
  // frappe en cours dès qu'une requête d'arrière-plan se termine.
  useEffect(() => {
    setContent(feedback?.content ?? "");
  }, [feedback?.id]);

  const saved = feedback?.content ?? "";
  // Un premier débrief vide reste légitime (« séance faite, rien à signaler ») ; ré-enregistrer
  // un texte inchangé, non.
  const canSubmit = feedback == null || content !== saved;

  const mediaError = mediaErrorMessage(
    addMedia.error ?? addAudio.error ?? removeMedia.error,
    recorderErrorKey,
    t,
  );

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}

        {isError ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isPending || isError ? null : (
          <>
            <View className="gap-1">
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {t("feedback.title")}
              </CmvText>
              <CmvText className="text-cmv-text-mid text-sm">{t("feedback.subtitle")}</CmvText>
            </View>

            <FeedbackForm
              value={content}
              onChange={setContent}
              onSubmit={() => upsert.mutate({ content: content.length === 0 ? null : content })}
              isSaving={upsert.isPending}
              canSubmit={canSubmit}
            />

            {upsert.isError ? (
              <CmvText className="text-cmv-error text-sm">
                {apiErrorMessage(upsert.error) ?? t("feedback.saveError")}
              </CmvText>
            ) : null}

            {upsert.isSuccess && !canSubmit ? (
              <CmvText className="text-cmv-accent text-sm">{t("feedback.saved")}</CmvText>
            ) : null}

            <View className="gap-3 border-cmv-border border-t pt-4">
              <CmvText className="text-cmv-text-mid text-sm">{t("feedback.media.title")}</CmvText>

              <MediaGrid
                media={feedback?.media ?? []}
                onRemove={(mediaId) => removeMedia.mutate(mediaId)}
                isRemoving={removeMedia.isPending}
              />

              <MediaPicker
                photosLeft={remainingSlots(feedback, MediaType.IMAGE)}
                videosLeft={remainingSlots(feedback, MediaType.VIDEO)}
                audiosLeft={remainingSlots(feedback, MediaType.AUDIO)}
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
              />

              {mediaError == null ? null : (
                <CmvText className="text-cmv-error text-sm">{mediaError}</CmvText>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

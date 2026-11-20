import type {
  MediaBatchStep,
  MediaRecapLine,
  MediaRecapReason,
  MediaRejection,
  MultipartRetry,
  SessionFeedbackDto,
} from "@cmv/shared";
import {
  MediaType,
  mediaRecapText,
  minutesOf,
  myFeedbackKeys,
  remainingMediaSlots,
  required,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackMediaGallery } from "@/feature/feedback/component/FeedbackMediaGallery";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import {
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useMyFeedbackMedia";
import { CmvButton, CmvProgressBar, useToast } from "@/shared/component";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useWebAudioRecorder } from "@/shared/hook/useWebAudioRecorder";
import { apiErrorMessage } from "@/shared/lib/api";
import { attachableMediaKind, MediaRejectedError } from "@/shared/util/media.util";

/**
 * L'état d'un envoi en cours. Extrait de `FeedbackMediaSection` parce que l'avis de réessai l'a
 * poussée au-delà du seuil de complexité de Biome — et parce que ces trois lignes forment un tout
 * qui se lit mieux ensemble qu'au milieu d'un écran.
 */
function MediaUploadStatus({
  progress,
  retry,
  step,
}: Readonly<{
  progress: number;
  retry: MultipartRetry | null;
  step: MediaBatchStep<string> | null;
}>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-xs">
      {/* Le rang n'est dit que s'il y a un rang à dire : « Envoi 1 / 1 » serait du bruit. */}
      {step != null && step.total > 1 ? (
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("feedback.media.batchProgress", {
            index: step.index,
            total: step.total,
            fileName: step.fileName,
          })}
        </span>
      ) : null}
      {/* Un réessai PREND la place du pourcentage : c'est lui qui explique pourquoi la barre
          n'avance plus. Laisser les deux ferait lire « 45 % » comme un envoi qui progresse. */}
      <span className="text-cmv-caption text-cmv-text-mid">
        {retry == null
          ? t("feedback.media.uploading", { percent: progress })
          : t("feedback.media.retrying", { attempt: retry.attempt, max: retry.maxAttempts })}
      </span>
      <CmvProgressBar percent={progress} label={t("feedback.media.uploadProgress")} />
    </div>
  );
}

// Photos, vidéos et notes vocales : quotas, ajout, retrait.
export function FeedbackMediaSection({
  sessionId,
  feedback,
}: Readonly<{ sessionId: string; feedback: SessionFeedbackDto | null }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddFeedbackMedia(sessionId);
  const remove = useDeleteFeedbackMedia(sessionId);
  const freshMediaUrl = useFreshMediaUrl(myFeedbackKeys.detail(sessionId));
  const fileInput = useRef<HTMLInputElement>(null);

  // Refus de l'enregistreur (micro, format) : il précède l'upload et ne passe par aucune mutation.
  const [recorderErrorKey, setRecorderErrorKey] = useState<string | null>(null);
  // Ce qui n'a pas été joint au dernier lot, fichier par fichier (#156).
  const [recap, setRecap] = useState<readonly MediaRecapLine<string>[]>([]);

  const photosLeft = remainingMediaSlots(feedback, MediaType.IMAGE);
  const videosLeft = remainingMediaSlots(feedback, MediaType.VIDEO);
  const audiosLeft = remainingMediaSlots(feedback, MediaType.AUDIO);

  const recorder = useWebAudioRecorder({
    allowedMimeTypes: FEEDBACK_MEDIA_PROFILE.audioMimeTypes,
    errorKeys: {
      permission: "feedback.media.permission",
      unsupported: "feedback.media.recorderUnsupported",
    },
    onRecorded: (audio) => {
      setRecorderErrorKey(null);
      add.addAudio(audio);
    },
    onError: setRecorderErrorKey,
    maxDurationSeconds: FEEDBACK_MEDIA_PROFILE.audioMaxDurationSeconds,
    onLimitReached: () =>
      toast.info(
        t("feedback.media.limitReached", {
          max: minutesOf(FEEDBACK_MEDIA_PROFILE.audioMaxDurationSeconds),
        }),
      ),
  });

  /**
   * Une sélection entière, d'un seul geste. Le tri, la file et le récapitulatif sont tenus par
   * `sendMediaBatch` (@cmv/shared) : l'écran ne fournit que ce qui lui est propre — les places
   * restantes et les libellés de ses refus.
   */
  async function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(required(event.target.files, "champ fichier sans FileList"));
    // Réinitialisé tout de suite : sans ça, rechoisir le MÊME fichier après un refus ne
    // déclencherait aucun `change`.
    event.target.value = "";
    if (picked.length === 0) return;

    setRecorderErrorKey(null);
    setRecap([]);
    setRecap(
      await add.addFiles({
        items: picked,
        // Le lot ne peut pas dépasser ce que les quotas laissent : au-delà, inutile de préparer.
        maxItems: photosLeft + videosLeft,
        remaining: {
          [MediaType.IMAGE]: photosLeft,
          [MediaType.VIDEO]: videosLeft,
          [MediaType.AUDIO]: audiosLeft,
        },
        kindOf: attachableMediaKind,
        nameOf: (file) => file.name,
        rejectedReason,
        failureReason,
      }),
    );
  }

  const audioError = resolveMediaError(add.audioError, recorderErrorKey, t);
  const canAddFile = (photosLeft > 0 || videosLeft > 0) && !add.isUploading;

  return (
    <section className="flex flex-col gap-cmv-md border-cmv-border border-t pt-cmv-lg">
      <div className="flex flex-col gap-cmv-xs">
        <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
          {t("feedback.media.title")}
        </h2>
        <p className="text-cmv-caption text-cmv-text-lo">
          {t("feedback.media.remaining", {
            photos: photosLeft,
            videos: videosLeft,
            audios: audiosLeft,
          })}
        </p>
      </div>

      <FeedbackMediaGallery
        media={feedback?.media ?? []}
        onRemove={(mediaId) => remove.mutate(mediaId)}
        isRemoving={remove.isPending}
        resolveMediaUrl={freshMediaUrl}
      />

      <div className="flex flex-wrap items-center gap-cmv-sm">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={onPickFiles}
        />
        <CmvButton
          variant="secondary"
          disabled={!canAddFile}
          onClick={() => fileInput.current?.click()}
        >
          {t("feedback.media.addFile")}
        </CmvButton>

        {/* Le bouton d'enregistrement DISPARAÎT quand le navigateur ne sait produire aucun format
            que le schéma du débrief accepte (Firefox, qui ne fait que du webm — refusé en 400 à la
            signature de l'URL). On le dit, plutôt que de laisser capturer pour rien. */}
        {recorder.isAvailable ? (
          <CmvButton
            variant="secondary"
            disabled={audiosLeft === 0 || add.isUploading}
            onClick={() => (recorder.isRecording ? recorder.stop(true) : recorder.start())}
          >
            {recorder.isRecording
              ? t("feedback.media.stopRecording", { seconds: recorder.seconds })
              : t("feedback.media.addAudio")}
          </CmvButton>
        ) : (
          <span className="text-cmv-caption text-cmv-text-lo">
            {t("feedback.media.recorderUnsupported")}
          </span>
        )}

        {recorder.isRecording ? (
          <CmvButton variant="ghost" onClick={() => recorder.stop(false)}>
            {t("common.cancel")}
          </CmvButton>
        ) : null}
      </div>

      {add.isUploading ? (
        <MediaUploadStatus progress={add.progress} retry={add.retry} step={add.step} />
      ) : null}

      {recap.length === 0 ? null : (
        <div className="flex flex-col gap-cmv-xs">
          <p className="text-cmv-caption text-cmv-text-mid">{t("feedback.media.recapTitle")}</p>
          <ul className="flex flex-col gap-cmv-xs">
            {/* La clé est le RANG DU FICHIER dans la sélection, porté par la ligne : deux fichiers
                peuvent avoir le même nom, mais jamais le même rang. */}
            {recap.map((entry) => (
              <li key={entry.id} className="text-cmv-body text-cmv-error-on">
                <span className="font-medium">{entry.fileName}</span>
                {" — "}
                {mediaRecapText(entry.reason, t)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {audioError == null ? null : <p className="text-cmv-body text-cmv-error-on">{audioError}</p>}
    </section>
  );
}

/**
 * Ce que dit un refus qui précède l'envoi. `tooMany` et `noSlot` disent la même chose ici, et c'est
 * exact : le plafond du lot EST la somme des places restantes.
 */
function rejectedReason({ cause, kind }: MediaRejection): MediaRecapReason {
  if (cause === "unsupported" || kind == null) {
    return { key: "feedback.media.unsupported", params: {} };
  }
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

/**
 * L'échec de la NOTE VOCALE, qui n'a pas de lot où être récapitulée. Un refus métier (format non
 * géré, note trop longue) porte sa propre clé i18n ; un refus de l'API garde son message, une panne
 * (réseau, 5xx) le message générique ; le refus du micro précède l'upload et arrive à la main. Les
 * trois se disent.
 */
function resolveMediaError(error: unknown, manualKey: string | null, t: TFunction): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey, error.params);
  return apiErrorMessage(error) ?? t("feedback.media.uploadError");
}

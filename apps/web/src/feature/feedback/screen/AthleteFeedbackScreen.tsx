import type { SessionFeedbackDto } from "@cmv/shared";
import { FEEDBACK_CONTENT_MAX_LENGTH, MediaType, remainingMediaSlots } from "@cmv/shared";
import { getRouteApi } from "@tanstack/react-router";
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackMediaGallery } from "@/feature/feedback/component/FeedbackMediaGallery";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import { useMyFeedback, useUpsertMyFeedback } from "@/feature/feedback/hook/useMyFeedback";
import {
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useMyFeedbackMedia";
import { useMyScheduledSession } from "@/feature/plan/hook/useMyPlan";
import {
  CmvAppShell,
  CmvButton,
  CmvCard,
  CmvErrorState,
  CmvProgressBar,
  CmvTextArea,
} from "@/shared/component";
import { useWebAudioRecorder } from "@/shared/hook/useWebAudioRecorder";
import { apiErrorMessage } from "@/shared/lib/api";
import { MediaRejectedError } from "@/shared/util/media.util";

const route = getRouteApi("/sessions/$sessionId/feedback");

/**
 * Le débrief d'une séance, côté athlète sur web (#26) : un champ texte libre + des médias, qu'on
 * peut reprendre plus tard.
 *
 * Écrire exige le réseau (pas d'écriture différée en MVP) : contrairement à la lecture de la
 * séance, on ne prétend pas fonctionner hors-ligne. L'échec est dit, pas masqué.
 *
 * Texte et médias ont chacun leurs mutations et leurs erreurs, qui ne se croisent jamais — un
 * upload qui échoue ne doit pas laisser croire que le texte n'est pas enregistré.
 */
export function AthleteFeedbackScreen() {
  const { t } = useTranslation();
  const { sessionId } = route.useParams();
  const session = useMyScheduledSession(sessionId);
  const { data: feedback, isPending, isError, refetch } = useMyFeedback(sessionId);

  return (
    <CmvAppShell
      title={t("feedback.title")}
      subtitle={session.data?.title ?? t("feedback.subtitle")}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {isPending || isError ? null : (
        <div className="flex max-w-3xl flex-col gap-cmv-lg">
          <FeedbackTextSection sessionId={sessionId} feedback={feedback ?? null} />
          <FeedbackMediaSection sessionId={sessionId} feedback={feedback ?? null} />
        </div>
      )}
    </CmvAppShell>
  );
}

// Le texte libre : saisie, enregistrement, et ce que l'enregistrement a donné.
function FeedbackTextSection({
  sessionId,
  feedback,
}: Readonly<{ sessionId: string; feedback: SessionFeedbackDto | null }>) {
  const { t } = useTranslation();
  const upsert = useUpsertMyFeedback(sessionId);
  const [content, setContent] = useState("");

  /**
   * Le formulaire part de ce qui est déjà enregistré (un débrief se complète en plusieurs fois).
   * On ne resynchronise QUE sur l'identité du débrief chargé : réécrire à chaque render effacerait
   * la frappe en cours dès qu'une requête d'arrière-plan se termine.
   *
   * Ajusté PENDANT le render et non dans un effet : c'est de l'état dérivé d'une donnée chargée
   * (même raisonnement que côté mobile).
   */
  const [syncedFeedbackId, setSyncedFeedbackId] = useState<string | null>(null);
  const loadedFeedbackId = feedback?.id ?? null;
  if (loadedFeedbackId !== syncedFeedbackId) {
    setSyncedFeedbackId(loadedFeedbackId);
    setContent(feedback?.content ?? "");
  }

  // Un PREMIER débrief vide reste légitime (« séance faite, rien à signaler ») ; ré-enregistrer un
  // texte inchangé, non.
  const canSubmit = feedback == null || content !== (feedback.content ?? "");

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-md">
        <CmvTextArea
          label={t("feedback.contentLabel")}
          name="feedback-content"
          placeholder={t("feedback.contentPlaceholder")}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
          rows={6}
        />
        <p className="text-cmv-caption text-cmv-text-lo">{t("feedback.contentHint")}</p>

        <div className="flex items-center gap-cmv-md">
          <CmvButton
            disabled={upsert.isPending || !canSubmit}
            onClick={() => upsert.mutate({ content: content.length === 0 ? null : content })}
          >
            {upsert.isPending ? t("feedback.saving") : t("feedback.save")}
          </CmvButton>

          {upsert.isError ? (
            <span className="text-cmv-body text-cmv-error-on">
              {apiErrorMessage(upsert.error) ?? t("feedback.saveError")}
            </span>
          ) : null}
          {upsert.isSuccess && !canSubmit ? (
            <span className="text-cmv-body text-cmv-accent">{t("feedback.saved")}</span>
          ) : null}
        </div>
      </div>
    </CmvCard>
  );
}

// Photos, vidéos et notes vocales : quotas, ajout, retrait.
function FeedbackMediaSection({
  sessionId,
  feedback,
}: Readonly<{ sessionId: string; feedback: SessionFeedbackDto | null }>) {
  const { t } = useTranslation();
  const add = useAddFeedbackMedia(sessionId);
  const remove = useDeleteFeedbackMedia(sessionId);
  const fileInput = useRef<HTMLInputElement>(null);

  // Refus de l'enregistreur (micro, format) : il précède l'upload et ne passe par aucune mutation.
  const [recorderErrorKey, setRecorderErrorKey] = useState<string | null>(null);

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
  });

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Réinitialisé tout de suite : sans ça, rechoisir le MÊME fichier après un refus ne
    // déclencherait aucun `change`.
    event.target.value = "";
    if (file == null) return;
    setRecorderErrorKey(null);
    add.addFile(file);
  }

  const error = resolveMediaError(add.error, recorderErrorKey, t);
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
      />

      <div className="flex flex-wrap items-center gap-cmv-sm">
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onPickFile}
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
        <div className="flex flex-col gap-cmv-xs">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("feedback.media.uploading", { percent: add.progress })}
          </span>
          <CmvProgressBar percent={add.progress} label={t("feedback.media.uploadProgress")} />
        </div>
      ) : null}

      {error == null ? null : <p className="text-cmv-body text-cmv-error-on">{error}</p>}
    </section>
  );
}

/**
 * Un refus métier (fichier trop lourd, format non géré, micro refusé) porte sa propre clé i18n ;
 * une panne technique garde le message de l'API. Les deux se disent — aucune ne se masque.
 */
function resolveMediaError(
  error: unknown,
  manualKey: string | null,
  t: (key: string) => string,
): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey);
  return apiErrorMessage(error) ?? t("feedback.media.uploadError");
}

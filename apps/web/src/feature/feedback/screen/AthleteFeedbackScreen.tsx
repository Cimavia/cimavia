import type {
  FeedbackTracking,
  MediaRecapLine,
  MediaRecapReason,
  MediaRejection,
  ScheduledSessionDto,
  SessionFeedbackDto,
} from "@cmv/shared";
import {
  FEEDBACK_CONTENT_MAX_LENGTH,
  MediaType,
  mediaRecapText,
  remainingMediaSlots,
} from "@cmv/shared";
import { getRouteApi, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackMediaGallery } from "@/feature/feedback/component/FeedbackMediaGallery";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import { useMyFeedback, useUpsertMyFeedback } from "@/feature/feedback/hook/useMyFeedback";
import {
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useMyFeedbackMedia";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
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
import { attachableMediaKind, MediaRejectedError } from "@/shared/util/media.util";

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
        <FeedbackBody
          sessionId={sessionId}
          session={session.data ?? null}
          feedback={feedback ?? null}
        />
      )}
    </CmvAppShell>
  );
}

/**
 * Le décompte, le texte et les médias — et UN seul envoi.
 *
 * Le décompte vit en local depuis la séance (`useLocalTracking`) ; le débrief est le moment où il
 * franchit le réseau, avec le texte. Un seul bouton pour les deux : deux boutons feraient croire
 * qu'on peut envoyer l'un sans l'autre, alors que le décompte ACCOMPAGNE le ressenti.
 *
 * La séance peut manquer (requête lente ou en erreur) sans rien bloquer : on perd le rappel des
 * coches, pas la possibilité d'écrire. Aucun décompte n'est alors envoyé — mieux vaut ne rien dire
 * que d'écraser le suivi avec un objet vide.
 */
function FeedbackBody({
  sessionId,
  session,
  feedback,
}: Readonly<{
  sessionId: string;
  session: ScheduledSessionDto | null;
  feedback: SessionFeedbackDto | null;
}>) {
  const { t } = useTranslation();
  const remote = useMemo(
    () =>
      Object.fromEntries(
        (session?.exercises ?? []).map((exercise) => [exercise.id, exercise.tracking]),
      ),
    [session],
  );
  const local = useLocalTracking(sessionId, remote);
  // Le local est effacé une fois le décompte accepté par le serveur : il a fait son travail, et
  // le garder ferait diverger les deux copies au prochain chargement.
  const upsert = useUpsertMyFeedback(sessionId, local.clear);
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

  // Un PREMIER débrief vide reste légitime — « j'ai fait la séance, rien à dire » est une réponse,
  // et forcer du texte n'en produit que de creux. Ré-enregistrer un débrief inchangé, non.
  const canSubmit = feedback == null || content !== (feedback.content ?? "") || local.dirty;

  return (
    <div className="flex flex-col gap-cmv-lg">
      {/* Retour vers LA SÉANCE et non le planning : le débrief est son enfant, et c'est de là
          qu'on vient. */}
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId }}
        className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
      >
        {t("feedback.backToSession")}
      </Link>

      <div className="grid w-full gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-cmv-lg">
          {session == null ? null : (
            <FeedbackTrackingSection
              exercises={session.exercises}
              tracking={local.tracking}
              onToggleUnit={local.toggleUnit}
              onRounds={local.setRounds}
            />
          )}

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
            </div>
          </CmvCard>

          <FeedbackMediaSection sessionId={sessionId} feedback={feedback ?? null} />
        </div>

        <FeedbackSubmitRail
          hasContent={content.length > 0}
          hasMedia={(feedback?.media.length ?? 0) > 0}
          hasTracking={hasAnyTracking(local.tracking)}
          canSubmit={canSubmit}
          isPending={upsert.isPending}
          error={upsert.isError ? (apiErrorMessage(upsert.error) ?? t("feedback.saveError")) : null}
          saved={upsert.isSuccess && !canSubmit}
          onSubmit={() =>
            upsert.mutate({
              content: content.length === 0 ? null : content,
              ...(session == null ? {} : { tracking: local.tracking }),
            })
          }
        />
      </div>
    </div>
  );
}

/** Au moins une unité cochée quelque part — ce qui distingue « rien envoyé » de « rien coché ». */
function hasAnyTracking(tracking: FeedbackTracking): boolean {
  return Object.values(tracking).some((exercise) =>
    Object.values(exercise ?? {}).some((state) =>
      "rounds" in state ? state.rounds > 0 : state.checked.length > 0,
    ),
  );
}

/**
 * Le rail d'envoi : ce qui va partir, puis le bouton pour le faire.
 *
 * La phrase est là pour qu'un débrief vide ne parte pas par accident — mais elle n'EMPÊCHE rien :
 * « séance faite, aucun commentaire, aucun décompte » est une réponse valable, et le bouton reste
 * actif pour la dire.
 */
function FeedbackSubmitRail({
  hasContent,
  hasMedia,
  hasTracking,
  canSubmit,
  isPending,
  error,
  saved,
  onSubmit,
}: Readonly<{
  hasContent: boolean;
  hasMedia: boolean;
  hasTracking: boolean;
  canSubmit: boolean;
  isPending: boolean;
  error: string | null;
  saved: boolean;
  onSubmit: () => void;
}>) {
  const { t } = useTranslation();
  const empty = !hasContent && !hasMedia && !hasTracking;

  return (
    <aside className="flex min-w-0 flex-col gap-cmv-md xl:sticky xl:top-32 xl:self-start">
      <CmvCard>
        <div className="flex flex-col gap-cmv-md">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {t("feedback.submit.title")}
          </h2>
          <p className="text-cmv-body text-cmv-text-mid">
            {t(empty ? "feedback.submit.empty" : "feedback.submit.filled")}
          </p>

          <CmvButton disabled={isPending || !canSubmit} onClick={onSubmit}>
            {isPending ? t("feedback.saving") : t("feedback.submit.action")}
          </CmvButton>

          {error == null ? null : <span className="text-cmv-body text-cmv-error-on">{error}</span>}
          {saved ? (
            <span className="text-cmv-body text-cmv-accent">{t("feedback.saved")}</span>
          ) : null}
        </div>
      </CmvCard>
    </aside>
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
  // Ce qui n'a pas été joint au dernier lot, fichier par fichier (#156).
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

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

  /**
   * Une sélection entière, d'un seul geste. Le tri, la file et le récapitulatif sont tenus par
   * `sendMediaBatch` (@cmv/shared) : l'écran ne fournit que ce qui lui est propre — les places
   * restantes et les libellés de ses refus.
   */
  async function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
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
        <div className="flex flex-col gap-cmv-xs">
          {/* Le rang n'est dit que s'il y a un rang à dire : « Envoi 1 / 1 » serait du bruit. */}
          {add.step != null && add.step.total > 1 ? (
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("feedback.media.batchProgress", {
                index: add.step.index,
                total: add.step.total,
                fileName: add.step.fileName ?? t("feedback.media.unnamedFile"),
              })}
            </span>
          ) : null}
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("feedback.media.uploading", { percent: add.progress })}
          </span>
          <CmvProgressBar percent={add.progress} label={t("feedback.media.uploadProgress")} />
        </div>
      ) : null}

      {recap.length === 0 ? null : (
        <div className="flex flex-col gap-cmv-xs">
          <p className="text-cmv-caption text-cmv-text-mid">{t("feedback.media.recapTitle")}</p>
          <ul className="flex flex-col gap-cmv-xs">
            {/* La clé est le RANG DU FICHIER dans la sélection, porté par la ligne : deux fichiers
                peuvent avoir le même nom, mais jamais le même rang. */}
            {recap.map((entry) => (
              <li key={entry.id} className="text-cmv-body text-cmv-error-on">
                <span className="font-medium">
                  {entry.fileName ?? t("feedback.media.unnamedFile")}
                </span>
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
 * géré, note trop longue) porte sa propre clé i18n ; une panne technique garde le message de
 * l'API ; le refus du micro précède l'upload et arrive à la main. Les trois se disent.
 */
function resolveMediaError(error: unknown, manualKey: string | null, t: TFunction): string | null {
  if (manualKey != null) return t(manualKey);
  if (error == null) return null;
  if (error instanceof MediaRejectedError) return t(error.reasonKey, error.params);
  return apiErrorMessage(error) ?? t("feedback.media.uploadError");
}

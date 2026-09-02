import type { MediaBatchStep } from "@cmv/shared";
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoMicOutline, IoSend, IoTrashOutline } from "react-icons/io5";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import { useToast } from "@/shared/component";
import type { RecordedWebAudio } from "@/shared/hook/useWebAudioRecorder";
import { useWebAudioRecorder } from "@/shared/hook/useWebAudioRecorder";

type ComposerProps = {
  onSendText: (text: string) => void;
  onSendFiles: (files: readonly File[]) => void;
  onRecordedAudio: (audio: RecordedWebAudio) => void;
  sending: boolean;
  mediaBusy: boolean;
  progress: number;
  /** Le fichier en cours dans un lot, `null` hors envoi. */
  step: MediaBatchStep | null;
};

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Barre d'envoi web : texte (Entrée envoie, Maj+Entrée saute une ligne), pièce jointe photo/vidéo,
 * et note vocale via MediaRecorder. Pendant l'enregistrement, la barre bascule en bandeau minuteur.
 */
export function Composer({
  onSendText,
  onSendFiles,
  onRecordedAudio,
  sending,
  mediaBusy,
  progress,
  step,
}: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useWebAudioRecorder({
    allowedMimeTypes: MESSAGE_MEDIA_PROFILE.audioMimeTypes,
    errorKeys: {
      permission: "messages.audio.permission",
      unsupported: "messages.audio.unsupported",
    },
    onRecorded: onRecordedAudio,
    onError: (key) => toast.error(t(key)),
  });

  const trimmed = text.trim();
  const canSendText = trimmed.length > 0 && !sending;

  const submitText = () => {
    if (!canSendText) return;
    onSendText(trimmed);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitText();
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Réinitialise pour permettre de re-choisir le même fichier ensuite.
    event.target.value = "";
    if (files.length > 0) onSendFiles(files);
  };

  if (recorder.isRecording) {
    return (
      <div className="flex items-center gap-cmv-md border-cmv-border border-t p-cmv-md">
        <span className="size-2.5 rounded-full bg-cmv-error" />
        <span className="flex-1 text-cmv-text-hi">{formatSeconds(recorder.seconds)}</span>
        <button
          type="button"
          onClick={() => recorder.stop(false)}
          title={t("common.cancel")}
          className="text-cmv-text-mid transition-colors hover:text-cmv-text-hi"
        >
          <IoTrashOutline size={22} />
        </button>
        <button
          type="button"
          onClick={() => recorder.stop(true)}
          title={t("messages.send")}
          className="text-cmv-accent transition-colors hover:text-cmv-accent-hi"
        >
          <IoSend size={22} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-cmv-border border-t p-cmv-md">
      <div className="flex items-end gap-cmv-md">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={onFileChange}
          className="hidden"
        />
        <button
          type="button"
          disabled={mediaBusy}
          onClick={() => fileInputRef.current?.click()}
          title={t("messages.attach")}
          className="pb-1 text-cmv-text-mid transition-colors hover:text-cmv-text-hi disabled:opacity-50"
        >
          <IoAddCircleOutline size={26} />
        </button>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("messages.placeholder")}
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-text-hi"
        />

        {canSendText ? (
          <button
            type="button"
            onClick={submitText}
            title={t("messages.send")}
            className="pb-1 text-cmv-accent transition-colors hover:text-cmv-accent-hi"
          >
            <IoSend size={22} />
          </button>
        ) : (
          <button
            type="button"
            disabled={mediaBusy}
            onClick={recorder.start}
            title={t("messages.record")}
            className="pb-1 text-cmv-text-mid transition-colors hover:text-cmv-text-hi disabled:opacity-50"
          >
            <IoMicOutline size={24} />
          </button>
        )}
      </div>

      {mediaBusy ? (
        <div className="flex flex-col pt-cmv-sm">
          {/* Le rang n'est dit que s'il y a un rang à dire : « Envoi 1 / 1 » serait du bruit. */}
          {step != null && step.total > 1 ? (
            <p className="text-cmv-caption text-cmv-text-mid">
              {t("messages.media.batchProgress", {
                index: step.index,
                total: step.total,
                fileName: step.fileName ?? t("messages.media.unnamedFile"),
              })}
            </p>
          ) : null}
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("messages.media.uploading", { percent: String(progress) })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

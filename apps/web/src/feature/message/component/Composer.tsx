import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoMicOutline, IoSend, IoTrashOutline } from "react-icons/io5";
import type { RecordedWebAudio } from "@/feature/message/hook/useWebAudioRecorder";
import { useWebAudioRecorder } from "@/feature/message/hook/useWebAudioRecorder";
import { useToast } from "@/shared/component";

type ComposerProps = {
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
  onRecordedAudio: (audio: RecordedWebAudio) => void;
  sending: boolean;
  mediaBusy: boolean;
  progress: number;
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
  onSendFile,
  onRecordedAudio,
  sending,
  mediaBusy,
  progress,
}: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useWebAudioRecorder(onRecordedAudio, (key) => toast.error(t(key)));

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
    const file = event.target.files?.[0];
    // Réinitialise pour permettre de re-choisir le même fichier ensuite.
    event.target.value = "";
    if (file != null) onSendFile(file);
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
          className="max-h-32 flex-1 resize-none rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-text-hi placeholder:text-cmv-text-mid"
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
        <p className="pt-cmv-sm text-cmv-caption text-cmv-text-mid">
          {t("messages.media.uploading", { percent: String(progress) })}
        </p>
      ) : null}
    </div>
  );
}

import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component";

type ComposerProps = {
  onSendText: (text: string) => void;
  sending: boolean;
};

/**
 * Barre d'envoi (texte). Entrée envoie, Maj+Entrée insère un saut de ligne — convention des
 * messageries. Les pièces jointes (photo/vidéo, note vocale via MediaRecorder) s'ajouteront ici.
 */
export function Composer({ onSendText, sending }: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending;

  const submit = () => {
    if (!canSend) return;
    onSendText(trimmed);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-cmv-sm border-cmv-border border-t p-cmv-md">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t("messages.placeholder")}
        rows={1}
        className="max-h-32 flex-1 resize-none rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-text-hi placeholder:text-cmv-text-mid"
      />
      <CmvButton onClick={submit} disabled={!canSend}>
        {t("messages.send")}
      </CmvButton>
    </div>
  );
}

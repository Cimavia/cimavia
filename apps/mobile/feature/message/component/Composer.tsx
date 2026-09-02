import type { MediaBatchStep } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { CmvAudioRecorder, CmvText, type RecordedAudio } from "@/shared/component";

type ComposerProps = {
  onSendText: (text: string) => void;
  onPickMedia: () => void;
  onRecordAudio: (audio: RecordedAudio) => void;
  onMediaError: (reasonKey: string) => void;
  sending: boolean;
  mediaBusy: boolean;
  /** Le média en cours dans un lot, `null` hors envoi. */
  step: MediaBatchStep | null;
};

/**
 * Barre d'envoi : texte, pièce jointe (photo/vidéo) et note vocale. Un seul `CmvAudioRecorder`
 * (instance persistante) occupe l'emplacement de fin : micro au repos, bandeau d'enregistrement
 * une fois lancé — pendant quoi la saisie texte et la pièce jointe s'effacent.
 */
export function Composer({
  onSendText,
  onPickMedia,
  onRecordAudio,
  onMediaError,
  sending,
  mediaBusy,
  step,
}: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);

  const trimmed = text.trim();
  const canSendText = trimmed.length > 0 && !sending;

  const submitText = () => {
    if (!canSendText) return;
    onSendText(trimmed);
    setText("");
  };

  const recorder = (
    <CmvAudioRecorder
      onRecorded={onRecordAudio}
      onRecordingChange={setRecording}
      onError={onMediaError}
      disabled={mediaBusy}
    />
  );

  return (
    <View className="border-cmv-border border-t bg-cmv-bg-1 p-3">
      <View className="flex-row items-end gap-2">
        {recording ? null : (
          <>
            <Pressable
              onPress={onPickMedia}
              disabled={mediaBusy}
              hitSlop={8}
              className={mediaBusy ? "pb-1 opacity-50" : "pb-1"}
            >
              <Ionicons name="add-circle-outline" size={26} color={cmvColors.text.mid} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t("messages.placeholder")}
              placeholderTextColor={cmvColors.text.lo}
              multiline
              textAlignVertical="center"
              className="max-h-32 flex-1 rounded-2xl border border-cmv-border bg-cmv-surface px-4 py-2 text-cmv-text-hi"
            />
          </>
        )}

        {!recording && canSendText ? (
          <Pressable onPress={submitText} hitSlop={8} className="pb-1">
            <Ionicons name="send" size={22} color={cmvColors.accent.DEFAULT} />
          </Pressable>
        ) : (
          recorder
        )}
      </View>

      {mediaBusy ? (
        <View className="flex-row items-center gap-2 pt-2">
          <ActivityIndicator />
          {/* Le rang n'est dit que s'il y a un rang à dire : « Envoi 1 / 1 » serait du bruit. */}
          <CmvText className="text-cmv-text-mid text-xs">
            {step != null && step.total > 1
              ? t("messages.media.batchProgress", {
                  index: step.index,
                  total: step.total,
                  fileName: step.fileName ?? t("messages.media.unnamedFile"),
                })
              : t("messages.media.uploading")}
          </CmvText>
        </View>
      ) : null}
    </View>
  );
}

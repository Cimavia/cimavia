import type { MediaBatchStep } from "@cmv/shared";
import { draftAfterSend, MESSAGE_TEXT_MAX_LENGTH } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { MESSAGE_AUDIO_NOTES_PER_CAPTURE, MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import type { AttachSource } from "@/feature/message/hook/useMessageMedia";
import {
  CmvAudioLimitNotice,
  CmvAudioRecorder,
  CmvCharCount,
  CmvText,
  type RecordedAudio,
} from "@/shared/component";

type ComposerProps = {
  /** Le champ ne se vide qu'une fois la promesse tenue : un échec laisse le texte en place. */
  onSendText: (text: string) => Promise<unknown>;
  onPickMedia: (source: AttachSource) => void;
  onRecordAudio: (audio: RecordedAudio) => void;
  /**
   * Une capture vient de démarrer, lancée à la main (#858). C'est là, et non à chaque note reçue,
   * que l'écran efface ses erreurs : une note relayée au plafond ne doit pas taire l'échec d'envoi
   * de la précédente.
   */
  onCaptureStart: () => void;
  onMediaError: (reasonKey: string) => void;
  sending: boolean;
  mediaBusy: boolean;
  /** Le média en cours dans un lot, `null` hors envoi. */
  step: MediaBatchStep | null;
};

/**
 * Ce que le bouton « joindre » propose (#771). Un choix EN LIGNE plutôt qu'une alerte native, pour
 * la raison que donne `CmvConfirmButton` : elle ignore les tokens, et le harnais ne la voit pas.
 */
const ATTACH_CHOICES = [
  { source: "media", icon: "images-outline", labelKey: "messages.attachChoice.media" },
  { source: "file", icon: "document-text-outline", labelKey: "messages.attachChoice.file" },
] as const satisfies readonly {
  source: AttachSource;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}[];

/**
 * Barre d'envoi : texte, pièce jointe (photo, vidéo ou PDF) et note vocale. Un seul `CmvAudioRecorder`
 * (instance persistante) occupe l'emplacement de fin : micro au repos, bandeau d'enregistrement
 * une fois lancé — pendant quoi la saisie texte et la pièce jointe s'effacent.
 */
export function Composer({
  onSendText,
  onPickMedia,
  onRecordAudio,
  onCaptureStart,
  onMediaError,
  sending,
  mediaBusy,
  step,
}: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // La note s'est arrêtée au plafond faute de relais (#856) : dit jusqu'au prochain enregistrement.
  const [limitReached, setLimitReached] = useState(false);
  // Un envoi qui démarre referme le choix — un débrief qui recharge passe aussi par là. Masqué
  // seulement, il resurgirait à la fin de l'envoi sans qu'on l'ait demandé.
  if (mediaBusy && choosing) setChoosing(false);

  const trimmed = text.trim();
  const canSendText = trimmed.length > 0 && !sending;

  // Le bouton d'envoi n'est rendu que si `canSendText`. Vider au clic perdait le texte sur un échec
  // (#339) ; l'échec, lui, est dit par l'écran : le texte n'a pas quitté le champ.
  const submitText = () => {
    const sent = trimmed;
    onSendText(sent).then(
      () => setText((draft) => draftAfterSend(draft, sent)),
      () => undefined,
    );
  };

  const recorder = (
    <CmvAudioRecorder
      onRecorded={onRecordAudio}
      onRecordingChange={(next) => {
        setRecording(next);
        // Le choix ouvert avant le micro ne doit pas resurgir quand l'enregistrement se termine.
        if (next) {
          setChoosing(false);
          setLimitReached(false);
          onCaptureStart();
        }
      }}
      onError={onMediaError}
      disabled={mediaBusy}
      // La réponse à un débrief passe aussi par ici : elle part dans le fil, au plafond du message.
      maxDurationSeconds={MESSAGE_MEDIA_PROFILE.audioMaxDurationSeconds}
      notesLeft={MESSAGE_AUDIO_NOTES_PER_CAPTURE}
      onLimitReached={() => setLimitReached(true)}
    />
  );

  const pick = (source: AttachSource) => {
    setChoosing(false);
    onPickMedia(source);
  };

  return (
    <View className="border-cmv-border border-t bg-cmv-bg-1 p-3">
      {choosing ? (
        <View className="flex-row gap-2 pb-2">
          {ATTACH_CHOICES.map((choice) => (
            <Pressable
              key={choice.source}
              onPress={() => pick(choice.source)}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 rounded-full border border-cmv-border bg-cmv-surface px-3 py-1.5"
            >
              <Ionicons name={choice.icon} size={16} color={cmvColors.text.mid} />
              <CmvText className="text-cmv-text-hi text-sm">{t(choice.labelKey)}</CmvText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-end gap-2">
        {recording ? null : (
          <>
            <Pressable
              onPress={() => setChoosing((current) => !current)}
              disabled={mediaBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("messages.attach")}
              accessibilityState={{ expanded: choosing }}
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
              maxLength={MESSAGE_TEXT_MAX_LENGTH}
              textAlignVertical="center"
              className="max-h-32 flex-1 rounded-2xl border border-cmv-border bg-cmv-surface px-4 py-2 text-cmv-text-hi"
            />
          </>
        )}

        {!recording && canSendText ? (
          <Pressable
            onPress={submitText}
            hitSlop={8}
            className="pb-1"
            // Sans nom, TalkBack lirait le glyphe de l'icône (#377), et Maestro ne le trouverait
            // pas (#638).
            accessibilityRole="button"
            accessibilityLabel={t("messages.send")}
          >
            <Ionicons name="send" size={22} color={cmvColors.accent.DEFAULT} />
          </Pressable>
        ) : (
          recorder
        )}
      </View>

      {/* Le champ s'efface pendant un enregistrement : son compteur avec lui. */}
      {recording ? null : <CmvCharCount length={text.length} maxLength={MESSAGE_TEXT_MAX_LENGTH} />}

      <CmvAudioLimitNotice
        visible={limitReached}
        maxDurationSeconds={MESSAGE_MEDIA_PROFILE.audioMaxDurationSeconds}
      />

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

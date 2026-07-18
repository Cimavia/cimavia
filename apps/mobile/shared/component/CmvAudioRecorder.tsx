import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatMmSs } from "@/shared/util/time";
import { CmvText } from "./CmvText";

export type RecordedAudio = { uri: string; durationSeconds: number };

type CmvAudioRecorderProps = {
  onRecorded: (audio: RecordedAudio) => void;
  // Permet au parent (composer) de masquer sa saisie texte pendant l'enregistrement.
  onRecordingChange?: (recording: boolean) => void;
  // Refus métier (permission, erreur d'enregistrement) → le parent traduit la clé i18n.
  onError?: (reasonKey: string) => void;
  disabled?: boolean;
};

/**
 * Enregistreur audio partagé (messagerie, et débrief vocal à venir). Au repos : un bouton micro.
 * Pendant l'enregistrement : un bandeau minuteur + annuler / envoyer. Composant de design system
 * réutilisable — d'où sa place dans `shared/component`.
 */
export function CmvAudioRecorder({
  onRecorded,
  onRecordingChange,
  onError,
  disabled,
}: Readonly<CmvAudioRecorderProps>) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    try {
      // Permission demandée au moment de l'usage (pas au lancement) : l'utilisateur comprend
      // pourquoi on la lui demande.
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError?.("messages.audio.permission");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      onRecordingChange?.(true);
    } catch {
      onError?.("messages.audio.recordError");
    }
  };

  const finish = async (keep: boolean) => {
    setBusy(true);
    // La durée est lue AVANT stop (après, l'état retombe à 0).
    const durationSeconds = Math.round(state.durationMillis / 1000);
    try {
      await recorder.stop();
      onRecordingChange?.(false);
      if (keep && recorder.uri != null && durationSeconds > 0) {
        onRecorded({ uri: recorder.uri, durationSeconds });
      }
    } catch {
      onRecordingChange?.(false);
      onError?.("messages.audio.recordError");
    } finally {
      setBusy(false);
    }
  };

  if (state.isRecording) {
    return (
      <View className="flex-1 flex-row items-center gap-3 rounded-2xl border border-cmv-border bg-cmv-surface px-4 py-2">
        <View className="h-2.5 w-2.5 rounded-full bg-cmv-error" />
        <CmvText className="flex-1 text-cmv-text-hi">
          {formatMmSs(state.durationMillis / 1000)}
        </CmvText>
        <Pressable onPress={() => finish(false)} disabled={busy} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color={cmvColors.text.mid} />
        </Pressable>
        <Pressable onPress={() => finish(true)} disabled={busy} hitSlop={8}>
          <Ionicons name="send" size={22} color={cmvColors.accent.DEFAULT} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={start}
      disabled={disabled}
      hitSlop={8}
      className={disabled === true ? "opacity-50" : ""}
    >
      <Ionicons name="mic-outline" size={24} color={cmvColors.text.mid} />
    </Pressable>
  );
}

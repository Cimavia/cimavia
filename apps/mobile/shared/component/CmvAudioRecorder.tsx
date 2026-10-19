import { formatMmSs } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
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
 * Le mode ENREGISTREMENT. Il passe EN ENTIER : le natif ne fusionne pas, il repart de ses défauts,
 * et ceux d'iOS posent `playsInSilentMode: false` (le type TS annonce `true`, qui est celui
 * d'Android). iOS refuse alors `allowsRecording` seul et lève avant d'atteindre le micro (#393).
 * La paire est indissociable.
 *
 * `allowsBackgroundRecording` garde la capture écran verrouillé (#619) : sans lui, expo-audio met
 * l'enregistreur en pause dès que l'app passe en arrière-plan, et la note garde un trou muet. Il
 * exige `enableBackgroundRecording` dans le plugin d'`app.json` — sans le service qu'il déclare,
 * Android refuse toute capture.
 */
function recordMode(background: boolean) {
  return { allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: background };
}

/**
 * Rebascule en mode LECTURE : le mode « record » posé au démarrage rendrait muette la lecture des
 * notes vocales qui suit (piège classique expo-audio). Passé en entier lui aussi, il remet
 * `allowsBackgroundRecording` à `false` sans l'écrire.
 */
const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true } as const;

/**
 * Le code de `NotificationPermissionsException` : Android lève à la préparation d'une capture en
 * arrière-plan quand `POST_NOTIFICATIONS` est refusée, faute de pouvoir afficher la notification de
 * son service. iOS ne la lève jamais.
 */
const NOTIFICATIONS_REFUSED = "ERR_NOTIFICATION_PERMISSIONS";

function isNotificationsRefused(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === NOTIFICATIONS_REFUSED;
}

/**
 * Le retour au mode lecture sur un chemin d'ÉCHEC : un micro pris par une autre app laisserait
 * sinon la session iOS en `.playAndRecord`. Best-effort — l'erreur qui a mené ici prime sur la
 * sienne.
 */
async function restorePlayback() {
  await setAudioModeAsync(PLAYBACK_MODE).catch(() => undefined);
}

type RecordingBannerProps = {
  durationMillis: number;
  busy: boolean;
  // Capture au premier plan seulement : elle se met en pause écran verrouillé, et le bandeau le dit.
  foregroundOnly: boolean;
  onFinish: (keep: boolean) => void;
};

/**
 * Le bandeau tient l'écran ALLUMÉ tant qu'il est affiché (#619) : la mise en veille automatique
 * (30 s par défaut sur iOS) tombe pendant qu'on parle, puisque parler n'est pas toucher. Il est
 * affiché tant que le natif dit enregistrer : envoi, annulation, échec ou démontage le retirent, et
 * la veille revient avec lui, sans rien à libérer à la main. Le tag est celui du hook (`useId`) :
 * propre à cette instance, il ne libère pas un maintien posé ailleurs.
 */
function RecordingBanner({
  durationMillis,
  busy,
  foregroundOnly,
  onFinish,
}: Readonly<RecordingBannerProps>) {
  const { t } = useTranslation();
  // Une activation refusée par l'OS ne doit pas laisser de promesse rejetée à la libération.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });

  return (
    <View className="flex-1 gap-1 rounded-2xl border border-cmv-border bg-cmv-surface px-4 py-2">
      <View className="flex-row items-center gap-3">
        <View className="h-2.5 w-2.5 rounded-full bg-cmv-error" />
        <CmvText className="flex-1 text-cmv-text-hi">{formatMmSs(durationMillis / 1000)}</CmvText>
        <Pressable onPress={() => onFinish(false)} disabled={busy} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color={cmvColors.text.mid} />
        </Pressable>
        <Pressable onPress={() => onFinish(true)} disabled={busy} hitSlop={8}>
          <Ionicons name="send" size={22} color={cmvColors.accent.DEFAULT} />
        </Pressable>
      </View>
      {foregroundOnly ? (
        <CmvText className="text-cmv-text-mid text-xs">
          {t("messages.audio.foregroundOnly")}
        </CmvText>
      ) : null}
    </View>
  );
}

/**
 * Enregistreur audio partagé (messagerie et débrief). Au repos : un bouton micro. Pendant
 * l'enregistrement : un bandeau minuteur + annuler / envoyer. Composant de design system
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
  const [foregroundOnly, setForegroundOnly] = useState(false);
  // Le mode « record » est posé, et ni `finish` ni un échec ne l'ont encore retiré : c'est lui que
  // le démontage rend. Posé AVANT la préparation, qui attend le service et laisse le temps de partir.
  const capturing = useRef(false);

  // Quitter l'écran en pleine capture : expo-audio libère l'enregistreur, rien ne part, mais le
  // mode « record » resterait posé et rendrait muettes les notes lues ensuite.
  useEffect(
    () => () => {
      if (capturing.current) void restorePlayback();
    },
    [],
  );

  /**
   * Prépare la capture en arrière-plan, ou au premier plan si Android refuse les notifications. On
   * ne les redemande pas ici : la demande appartient à `usePushToken`, et un refus déjà donné vaut
   * aussi pour la note. Rend `true` si la capture survit au verrouillage.
   */
  const prepare = async (): Promise<boolean> => {
    try {
      await recorder.prepareToRecordAsync();
      return true;
    } catch (error) {
      if (!isNotificationsRefused(error)) throw error;
      await setAudioModeAsync(recordMode(false));
      await recorder.prepareToRecordAsync();
      return false;
    }
  };

  const start = async () => {
    try {
      // Permission demandée au moment de l'usage (pas au lancement) : l'utilisateur comprend
      // pourquoi on la lui demande.
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError?.("messages.audio.permission");
        return;
      }
      capturing.current = true;
      await setAudioModeAsync(recordMode(true));
      const background = await prepare();
      recorder.record();
      setForegroundOnly(!background);
      onRecordingChange?.(true);
    } catch (error) {
      // Le natif NOMME la panne (#393 : « playsInSilentMode == false and allowsRecording == true
      // cannot be set on iOS ») ; sans cette remontée, seul le message générique la signale.
      capturing.current = false;
      Sentry.captureException(error);
      await restorePlayback();
      onError?.("messages.audio.recordError");
    }
  };

  const finish = async (keep: boolean) => {
    setBusy(true);
    capturing.current = false;
    // La durée est lue AVANT stop (après, l'état retombe à 0).
    const durationSeconds = Math.round(state.durationMillis / 1000);
    try {
      await recorder.stop();
      await setAudioModeAsync(PLAYBACK_MODE);
      onRecordingChange?.(false);
      if (keep && recorder.uri != null && durationSeconds > 0) {
        onRecorded({ uri: recorder.uri, durationSeconds });
      }
    } catch (error) {
      Sentry.captureException(error);
      await restorePlayback();
      onRecordingChange?.(false);
      onError?.("messages.audio.recordError");
    } finally {
      setBusy(false);
    }
  };

  if (state.isRecording) {
    return (
      <RecordingBanner
        durationMillis={state.durationMillis}
        busy={busy}
        foregroundOnly={foregroundOnly}
        onFinish={finish}
      />
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

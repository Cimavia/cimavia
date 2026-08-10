import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecorderMimeType } from "@/shared/util/media.util";

export type RecordedWebAudio = { blob: Blob; durationSeconds: number };

export type WebAudioRecorderOptions = {
  /**
   * Les mimes que le SCHÉMA de la feature accepte, pas ceux que le navigateur sait produire : la
   * messagerie accepte `audio/webm`, le débrief non.
   */
  allowedMimeTypes: readonly string[];
  /** Clés i18n LITTÉRALES, fournies par la feature — jamais assemblées ici. */
  errorKeys: { permission: string; unsupported: string };
  onRecorded: (audio: RecordedWebAudio) => void;
  onError: (reasonKey: string) => void;
};

/**
 * Enregistreur audio navigateur (MediaRecorder) : démarrer, arrêter (envoyer) ou annuler. Libère
 * toujours le micro (pistes du flux) en fin de vie, y compris au démontage.
 *
 * Promu de `feature/message/` : la messagerie et le débrief l'utilisent tous les deux (#26).
 *
 * `isAvailable` à `false` veut dire que ce navigateur ne sait produire AUCUN format que la feature
 * accepte — Firefox et le débrief, par exemple, qui refuse `audio/webm`. L'appelant doit alors ne
 * pas proposer d'enregistrer, plutôt que de laisser capturer trente secondes pour un 400 à la
 * signature de l'URL.
 */
export function useWebAudioRecorder({
  allowedMimeTypes,
  errorKeys,
  onRecorded,
  onError,
}: WebAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  /**
   * Mémoïsé pour une raison de fond, pas de style : cette fonction est le nettoyage de l'effet de
   * démontage ci-dessous. Recréée à chaque render, elle rendrait cet effet dépendant du render —
   * React couperait le micro et remettrait `isRecording` à false au milieu d'un enregistrement.
   * Ses seules dépendances sont des refs et un setter, tous stables : la liste vide est exacte.
   */
  const cleanup = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  // Libère le micro si le composant est démonté en cours d'enregistrement.
  useEffect(() => cleanup, [cleanup]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // `null` a déjà éteint le bouton via `isAvailable` ; la garde reste pour ne jamais
      // laisser MediaRecorder choisir seul un format que le schéma refusera.
      const mimeType = pickRecorderMimeType(allowedMimeTypes);
      if (mimeType == null) {
        cleanup();
        onError(errorKeys.unsupported);
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        cleanup();
        if (durationSeconds > 0) onRecorded({ blob, durationSeconds });
      };

      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setIsRecording(true);
      intervalRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      cleanup();
      onError(errorKeys.permission);
    }
  };

  // Arrête l'enregistrement. `keep=false` jette la capture (onstop neutralisé).
  const stop = (keep: boolean) => {
    const recorder = recorderRef.current;
    if (recorder == null) return;
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!keep) {
      recorder.onstop = () => cleanup();
    }
    recorder.stop();
    setIsRecording(false);
  };

  return {
    isRecording,
    seconds,
    start,
    stop,
    isAvailable: pickRecorderMimeType(allowedMimeTypes) != null,
  };
}

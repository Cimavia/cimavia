import { formatMmSs } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import {
  type AudioRecorder,
  RecordingPresets,
  type RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, AppState, Platform, Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

export type RecordedAudio = { uri: string; durationSeconds: number };

type CmvAudioRecorderProps = {
  onRecorded: (audio: RecordedAudio) => void;
  // Permet au parent (composer) de masquer sa saisie texte pendant l'enregistrement.
  onRecordingChange?: (recording: boolean) => void;
  // Refus métier (permission, erreur d'enregistrement) → le parent traduit la clé i18n.
  onError?: (reasonKey: string) => void;
  disabled?: boolean;
  /**
   * Le plafond du profil, en secondes (#856). Le natif clôt la note à ce terme et elle part comme
   * sur un tap « envoyer » : refusée à l'envoi, elle se perdait en entier.
   */
  maxDurationSeconds: number;
  /**
   * Les notes que la capture peut encore produire, celle en cours comprise, lu au démarrage. Au
   * plafond, la parole continue dans une note neuve tant qu'il en reste. Absent : sans limite.
   */
  notesLeft?: number;
  /** Au plafond, rien n'a pu prendre la suite : la capture s'est arrêtée, le parent le dit. */
  onLimitReached?: () => void;
};

type Slot = 0 | 1;

const otherSlot = (slot: Slot): Slot => (slot === 0 ? 1 : 0);

/**
 * L'écart toléré entre la fin native et le plafond. La note est mesurée à l'horloge depuis
 * `record()`, que le natif arme un instant plus tard : au plafond, elle dure au moins le plafond, à
 * quelques millisecondes près. Bien en deçà, c'est une autre fin — une interruption iOS, un arrêt
 * venu d'ailleurs.
 */
const CAP_TOLERANCE_MS = 1000;

/** L'intervalle du relevé natif (`useAudioRecorderState`) : l'écart maximal du dernier relevé. */
const POLL_INTERVAL_MS = 500;

/**
 * L'écart entre l'horloge et le dernier relevé au-delà duquel une capture au premier plan seul a
 * été mise en pause. Large : un fil JS en retard d'une seconde ne doit pas passer pour une pause.
 */
const PAUSE_THRESHOLD_MS = 5000;

/**
 * Le preset de chaque préparation, et non du seul montage. Sans options, iOS réutilise son
 * `AVAudioRecorder`, donc son FICHIER : préparer à nouveau l'enregistreur d'une note qui vient de
 * partir écraserait le fichier en plein envoi. Avec elles, il en crée un neuf, au nom unique — ce
 * qu'Android fait à chaque préparation.
 */
const PRESET = RecordingPresets.HIGH_QUALITY;

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

/**
 * Remet l'enregistreur à zéro après un démarrage raté. Côté Android, `prepareRecording` pose
 * `isPrepared` et refuse toute nouvelle préparation tant que l'enregistreur n'est ni arrêté ni
 * libéré : sans cela, un `record()` qui lève condamne chaque tap suivant (#700). `stop()` libère le
 * `MediaRecorder` même quand rien n'a démarré. Best-effort, comme `restorePlayback`.
 */
async function releaseRecorder(recorder: { stop: () => Promise<void> }) {
  await recorder.stop().catch(() => undefined);
}

/**
 * Prépare l'enregistreur qui prendra la suite au plafond (#856), pour que la parole ne soit pas
 * coupée. Avec le service de premier plan, Android le DÉMARRE puis le met en pause : ce service ne
 * compte que les enregistreurs démarrés et s'arrête avec le dernier, et Android 14 refuse de le
 * relancer écran verrouillé — la note suivante serait muette. Sans le service, préparé suffit : un
 * relais en pause, expo-audio le relancerait au retour de l'app au premier plan, par-dessus la note.
 * iOS n'a pas de tel service.
 */
async function arm(recorder: AudioRecorder, withService: boolean) {
  await recorder.prepareToRecordAsync(PRESET);
  if (Platform.OS === "android" && withService) {
    recorder.record();
    recorder.pause();
  }
}

/**
 * Le natif NOMME la panne par un `code` (`ERR_NOTIFICATION_PERMISSIONS`, …) et la plateforme dit
 * quel natif a parlé : sans eux, seul le message générique signale l'échec (#700). Le code n'est
 * posé que s'il existe.
 */
function captureRecorderError(error: unknown) {
  const code = error instanceof Error && "code" in error ? String(error.code) : undefined;
  Sentry.captureException(error, {
    tags: { platform: Platform.OS, ...(code == null ? {} : { code }) },
  });
}

type RecordingBannerProps = {
  durationMillis: number;
  busy: boolean;
  // Capture au premier plan seulement : elle se met en pause écran verrouillé, et le bandeau le dit.
  foregroundOnly: boolean;
  // Les notes déjà parties au plafond pendant cette capture (#856).
  relayed: number;
  onFinish: (keep: boolean) => void;
};

/**
 * Le bandeau tient l'écran ALLUMÉ tant qu'il est affiché (#619) : la mise en veille automatique
 * (30 s par défaut sur iOS) tombe pendant qu'on parle, puisque parler n'est pas toucher. Il est
 * affiché le temps de la capture, relais compris (#856) : envoi, annulation, échec ou démontage le
 * retirent, et la veille revient avec lui, sans rien à libérer à la main. Le tag est celui du hook
 * (`useId`) : propre à cette instance, il ne libère pas un maintien posé ailleurs.
 */
function RecordingBanner({
  durationMillis,
  busy,
  foregroundOnly,
  relayed,
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
        <Pressable
          onPress={() => onFinish(false)}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("messages.audio.discard")}
        >
          <Ionicons name="trash-outline" size={22} color={cmvColors.text.mid} />
        </Pressable>
        <Pressable
          onPress={() => onFinish(true)}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("messages.audio.send")}
        >
          <Ionicons name="send" size={22} color={cmvColors.accent.on} />
        </Pressable>
      </View>
      {relayed > 0 ? (
        <CmvText className="text-cmv-text-mid text-xs">
          {t("messages.audio.relayed", { index: relayed })}
        </CmvText>
      ) : null}
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
 *
 * DEUX enregistreurs natifs se relaient (#856) : au plafond, celui qui capte s'arrête, sa note
 * part, et l'autre — préparé d'avance — reprend la parole sans la couper. Le bandeau reste, et son
 * minuteur cumule les notes de la capture.
 */
export function CmvAudioRecorder({
  onRecorded,
  onRecordingChange,
  onError,
  disabled,
  maxDurationSeconds,
  notesLeft,
  onLimitReached,
}: Readonly<CmvAudioRecorderProps>) {
  const { t } = useTranslation();
  /**
   * La fin que le natif annonce : au plafond, il s'arrête SEUL. expo-audio n'abonne l'écouteur
   * qu'une fois, au montage : il lit donc la version courante par ref, comme les lecteurs
   * (`CmvVideoPlayer`).
   */
  const onNativeEndRef = useRef<(slot: Slot, status: RecordingStatus) => void>(() => undefined);
  const first = useAudioRecorder(PRESET, (status) => onNativeEndRef.current(0, status));
  const second = useAudioRecorder(PRESET, (status) => onNativeEndRef.current(1, status));
  const firstState = useAudioRecorderState(first);
  const secondState = useAudioRecorderState(second);
  const recorders = [first, second] as const;
  const stateOf = (slot: Slot) => (slot === 0 ? firstState : secondState);
  /**
   * L'enregistreur qui capte ; l'autre est celui du relais. Un `ref`, qui le dit DÈS le relais,
   * avant le rendu qui suit : un tap « envoyer » ou une fin native arrivés dans l'intervalle visent
   * le bon. Le rendu, lui, vient avec le compte des notes relayées.
   */
  const activeSlot = useRef<Slot>(0);
  const state = stateOf(activeSlot.current);
  const [busy, setBusy] = useState(false);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  // Le mode « record » est posé, et ni `finish` ni un échec ne l'ont encore retiré : c'est lui que
  // le démontage rend. Posé AVANT la préparation, qui attend le service et laisse le temps de partir.
  const capturing = useRef(false);
  /**
   * L'enregistreur est à nous, du tap jusqu'à la fin de `finish` ou d'un démarrage raté (#731).
   * Android le prend dès le début de la préparation, puis attend jusqu'à 5 s la liaison du service
   * de premier plan : un second tap dans cet intervalle le trouvait pris, et son échec libérait
   * celui du premier. Le `ref` refuse ce tap même avant le rendu suivant.
   */
  const engaged = useRef(false);
  /**
   * Ce que montre le composant. `recording` est posé dès que `record()` est passé, sans attendre
   * le relevé natif (toutes les 500 ms) : le micro ne revient pas dans l'intervalle, et une capture
   * que le natif ne confirme jamais garde son bandeau, donc sa corbeille.
   */
  const [phase, setPhase] = useState<"idle" | "preparing" | "recording">("idle");
  /**
   * L'instant de `record()`. Au plafond, le relevé natif est déjà retombé à 0 (Android remet sa
   * durée à zéro en s'arrêtant) : c'est l'horloge qui mesure la note.
   */
  const startedAt = useRef(0);
  // L'enregistreur du relais est prêt à prendre la suite.
  const armed = useRef(false);
  /**
   * Le rang de la capture. Une préparation du relais attend jusqu'à 5 s le service d'Android : celle
   * d'une capture close, résolue pendant la suivante, ne doit pas se croire prête pour elle.
   */
  const generation = useRef(0);
  // Les notes que la capture peut encore produire, celle en cours comprise.
  const remaining = useRef(Number.POSITIVE_INFINITY);
  // Les notes déjà parties au plafond, et ce qu'elles ont duré : le minuteur ne repart pas de zéro.
  const [relayed, setRelayed] = useState(0);
  const [relayedMillis, setRelayedMillis] = useState(0);
  // La dernière préparation du relais lancée : la suivante l'attend, pour ne pas la croiser.
  const arming = useRef<Promise<void>>(Promise.resolve());
  /**
   * Le dernier relevé natif de la note en cours, tant qu'elle capte. Au premier plan seul, la
   * capture se met en pause écran verrouillé, et l'horloge compterait la pause.
   */
  const captured = useRef(0);
  useEffect(() => {
    if (state.isRecording) captured.current = state.durationMillis;
  }, [state.isRecording, state.durationMillis]);
  // La capture tient le service de premier plan : c'est lui que l'amorce du relais doit garder.
  const withService = useRef(false);
  // Une préparation en vol au démontage vise des enregistreurs libérés : rien à signaler.
  const unmounted = useRef(false);

  const toIdle = () => {
    engaged.current = false;
    setPhase("idle");
  };

  /**
   * La durée transmise, BORNÉE au plafond : relevée toutes les 500 ms puis arrondie, elle peut
   * rendre 301 s, qu'on refuserait à l'envoi comme avant.
   */
  const toSeconds = (durationMillis: number) =>
    Math.min(Math.round(durationMillis / 1000), maxDurationSeconds);

  // Quitter l'écran en pleine capture : expo-audio libère les enregistreurs, rien ne part, mais le
  // mode « record » resterait posé et rendrait muettes les notes lues ensuite.
  useEffect(
    () => () => {
      unmounted.current = true;
      if (capturing.current) void restorePlayback();
    },
    [],
  );

  /**
   * Prépare la capture en arrière-plan, ou au premier plan si Android refuse les notifications. On
   * ne les redemande pas ici : la demande appartient à `usePushToken`, et un refus déjà donné vaut
   * aussi pour la note. Rend `true` si la capture survit au verrouillage.
   */
  const prepare = async (recorder: AudioRecorder): Promise<boolean> => {
    try {
      await recorder.prepareToRecordAsync(PRESET);
      return true;
    } catch (error) {
      if (!isNotificationsRefused(error)) throw error;
      await setAudioModeAsync(recordMode(false));
      await recorder.prepareToRecordAsync(PRESET);
      return false;
    }
  };

  /**
   * Prépare le relais sur `slot`, s'il reste une note à produire après celle en cours. Un échec ne
   * coupe pas la capture : elle s'arrêtera au plafond, comme sans relais.
   *
   * Une préparation n'est prête que pour SA capture : close entre-temps, ou remplacée par une
   * neuve, elle libère l'enregistreur. Les préparations passent une à une — celle d'Android attend
   * jusqu'à 5 s son service, et deux sur le même enregistreur se croiseraient.
   */
  const prepareRelay = (slot: Slot) => {
    const capture = generation.current;
    const run = arming.current.then(async () => {
      if (capture !== generation.current || remaining.current <= 1 || unmounted.current) return;
      try {
        await arm(recorders[slot], withService.current);
        if (capturing.current && capture === generation.current) armed.current = true;
        else await releaseRecorder(recorders[slot]);
      } catch (error) {
        if (unmounted.current) return;
        captureRecorderError(error);
        await releaseRecorder(recorders[slot]);
      }
    });
    arming.current = run;
    return run;
  };

  /** Libère le relais s'il est prêt : rien ne prendra plus la suite. */
  const disarm = async (slot: Slot) => {
    if (!armed.current) return;
    armed.current = false;
    await releaseRecorder(recorders[slot]);
  };

  const start = async () => {
    if (engaged.current) return;
    const recorder = recorders[activeSlot.current];
    engaged.current = true;
    setPhase("preparing");
    try {
      // Permission demandée au moment de l'usage (pas au lancement) : l'utilisateur comprend
      // pourquoi on la lui demande.
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        toIdle();
        onError?.("messages.audio.permission");
        return;
      }
      capturing.current = true;
      generation.current += 1;
      remaining.current = notesLeft ?? Number.POSITIVE_INFINITY;
      setRelayed(0);
      setRelayedMillis(0);
      await setAudioModeAsync(recordMode(true));
      const background = await prepare(recorder);
      withService.current = background;
      /**
       * Le plafond est tenu par le NATIF, et non par le relevé JS : Android suspend les timers JS
       * dès l'écran verrouillé (`JavaTimerManager.onHostPause`), quand la capture, elle, continue
       * (#619). Un arrêt piloté côté JS laisserait la note dépasser le plafond sans le voir.
       */
      recorder.record({ forDuration: maxDurationSeconds });
      startedAt.current = Date.now();
      captured.current = 0;
      // APRÈS le départ de la note, que sa préparation ne retarde pas : le relais a cinq minutes.
      void prepareRelay(otherSlot(activeSlot.current));
      setPhase("recording");
      setForegroundOnly(!background);
      onRecordingChange?.(true);
    } catch (error) {
      // Le natif NOMME la panne (#393 : « playsInSilentMode == false and allowsRecording == true
      // cannot be set on iOS ») ; sans cette remontée, seul le message générique la signale.
      capturing.current = false;
      captureRecorderError(error);
      await releaseRecorder(recorder);
      await disarm(otherSlot(activeSlot.current));
      await restorePlayback();
      // Le micro ne revient qu'une fois l'enregistreur libéré : un tap plus tôt le trouverait pris.
      toIdle();
      onError?.("messages.audio.recordError");
    }
  };

  /**
   * Clôt la capture, qu'elle finisse sur un tap ou au plafond. `stop` arrête le natif — ou, au
   * plafond, constate qu'il s'est arrêté seul — et rend le fichier de la note. Le relais, s'il était
   * prêt, est libéré dans tous les cas : sur Android, il garderait le service de premier plan.
   */
  const close = async (
    keep: boolean,
    durationMillis: number,
    stop: () => Promise<string | null>,
    onSent?: () => void,
  ) => {
    setBusy(true);
    // Baissé AVANT l'arrêt : la fin que celui-ci annonce à son tour ne doit pas clore une 2ᵉ fois.
    capturing.current = false;
    const durationSeconds = toSeconds(durationMillis);
    /**
     * Le relais est libéré AVANT le mode lecture : celui-ci retire le service de premier plan aux
     * enregistreurs d'Android (`useForegroundService`), et l'arrêt d'un relais amorcé ne l'en
     * désinscrirait plus — le service et sa notification resteraient.
     */
    await disarm(otherSlot(activeSlot.current));
    try {
      const uri = await stop();
      await setAudioModeAsync(PLAYBACK_MODE);
      onRecordingChange?.(false);
      if (keep && uri != null && durationSeconds > 0) {
        onRecorded({ uri, durationSeconds });
        onSent?.();
      }
    } catch (error) {
      captureRecorderError(error);
      await restorePlayback();
      onRecordingChange?.(false);
      onError?.("messages.audio.recordError");
    } finally {
      toIdle();
      setBusy(false);
    }
  };

  // La durée est lue AVANT stop (après, l'état retombe à 0).
  const finish = (keep: boolean) => {
    const slot = activeSlot.current;
    const recorder = recorders[slot];
    return close(keep, stateOf(slot).durationMillis, async () => {
      await recorder.stop();
      return recorder.uri;
    });
  };

  /**
   * Au plafond, la parole continue sur le relais et la note close part. Rend `false` si rien ne
   * peut prendre la suite : la capture s'arrête alors comme sur un tap « envoyer ».
   */
  const relay = (finished: Slot, uri: string, durationMillis: number): boolean => {
    if (!armed.current) return false;
    // Sans service de premier plan, Android ne donne que du silence à un micro ouvert en arrière-plan.
    if (foregroundOnly && AppState.currentState !== "active") return false;
    const next = otherSlot(finished);
    try {
      recorders[next].record({ forDuration: maxDurationSeconds });
      // iOS ne lève pas quand `AVAudioRecorder` refuse de démarrer : il rend `false`, qu'expo-audio
      // ignore. Seul le natif lui-même dit s'il capte — sinon la note suivante serait vide.
      if (!recorders[next].isRecording) throw new Error("relay recorder did not start");
    } catch (error) {
      captureRecorderError(error);
      return false;
    }
    armed.current = false;
    startedAt.current = Date.now();
    captured.current = 0;
    remaining.current -= 1;
    activeSlot.current = next;
    setRelayed((count) => count + 1);
    setRelayedMillis((total) => total + durationMillis);
    onRecorded({ uri, durationSeconds: toSeconds(durationMillis) });
    // Le relais suivant se prépare sur l'enregistreur qui vient de finir.
    void prepareRelay(finished);
    return true;
  };

  /**
   * La fin que le natif annonce nomme le fichier. Au plafond, la note part et la parole continue
   * sur le relais, ou s'arrête si rien ne peut le prendre. Une fin bien avant le plafond (une
   * interruption iOS, un arrêt venu d'ailleurs) clôt la capture sans relais ni avis de plafond — la
   * note gardée vaut mieux qu'un tap « envoyer » qui lirait une durée de 0.
   *
   * Une fin SANS fichier est un échec, même annoncée sans erreur : iOS en émet une quand ses
   * services média redémarrent (`mediaServicesDidReset`). L'échec libère l'enregistreur — l'`onError`
   * d'Android ne le fait pas, et le tap suivant le trouverait encore préparé (#700).
   *
   * Seule compte la fin de l'enregistreur qui capte, pendant la capture : celle du relais libéré, ou
   * en retard sur une capture déjà close, est ignorée.
   */
  onNativeEndRef.current = (slot, status) => {
    if (
      !status.isFinished ||
      !capturing.current ||
      phase !== "recording" ||
      slot !== activeSlot.current
    ) {
      return;
    }
    const elapsed = Date.now() - startedAt.current;
    // Au premier plan seul, le natif clôt au plafond de l'HORLOGE, pause écran verrouillé comprise :
    // c'est le dernier relevé qui dit ce que la note a capté, à un relevé près.
    const measured = captured.current + POLL_INTERVAL_MS;
    const durationMillis =
      foregroundOnly && elapsed - measured > PAUSE_THRESHOLD_MS ? measured : elapsed;
    const uri = status.hasError ? null : status.url;
    const atCap = durationMillis >= maxDurationSeconds * 1000 - CAP_TOLERANCE_MS;
    if (uri != null && atCap && relay(slot, uri, durationMillis)) return;
    void close(
      true,
      durationMillis,
      async () => {
        if (uri != null) return uri;
        await releaseRecorder(recorders[slot]);
        throw new Error(status.error ?? "native recording ended without a file");
      },
      // Le plafond n'est dit qu'une fois la note partie : un échec, lui, a son propre message.
      atCap ? onLimitReached : undefined,
    );
  };

  // Le bandeau tient tant que la capture est à nous, ou que le natif dit encore enregistrer : un
  // arrêt qui échoue le garde, corbeille comprise.
  if (phase === "recording" || state.isRecording) {
    return (
      <RecordingBanner
        durationMillis={relayedMillis + state.durationMillis}
        busy={busy}
        foregroundOnly={foregroundOnly}
        relayed={relayed}
        onFinish={finish}
      />
    );
  }

  // Même emprise que l'icône du micro (24 px), pour que la barre ne bouge pas pendant l'attente.
  if (phase === "preparing") {
    return (
      <View className="h-6 w-6 items-center justify-center">
        <ActivityIndicator size="small" color={cmvColors.text.mid} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={start}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t("messages.audio.record")}
      className={disabled === true ? "opacity-50" : ""}
    >
      <Ionicons name="mic-outline" size={24} color={cmvColors.text.mid} />
    </Pressable>
  );
}

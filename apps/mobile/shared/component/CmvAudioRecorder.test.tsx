import * as Sentry from "@sentry/react-native";
import { act, waitFor } from "@testing-library/react";
import {
  RecordingPresets,
  type RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { AppState, Platform } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { press, renderRn } from "@/test/render";
import { CmvAudioRecorder } from "./CmvAudioRecorder";

/** La `NotificationPermissionsException` d'Android, telle que le pont la rend au JS. */
function notificationsRefused() {
  return Object.assign(new Error("POST_NOTIFICATIONS permission has not been granted"), {
    code: "ERR_NOTIFICATION_PERMISSIONS",
  });
}

// L'état de `POST_NOTIFICATIONS` sur le téléphone simulé : accordée, sauf quand un test la refuse.
let notificationsGranted = true;

/**
 * Un enregistreur STABLE d'un rendu à l'autre : le faux par défaut en fabrique un neuf à chaque
 * appel du hook, et l'assertion porterait alors sur un objet que le composant n'a jamais touché.
 *
 * Sa préparation suit la règle d'Android (#619) : en arrière-plan, sans `POST_NOTIFICATIONS`, elle
 * lève. Elle lit le DERNIER mode posé — un repli qui retenterait sans changer de mode échouerait
 * donc ici comme sur le téléphone.
 *
 * L'enregistreur est pris DÈS le début de la préparation, puis attend la liaison du service de
 * premier plan — jusqu'à 5 s sur Android (#731). `hold()` suspend cette attente et rend de quoi la
 * lever : c'est la fenêtre où un second tap trouvait l'enregistreur déjà pris.
 */
function fakeRecorder(uri = "file:///cache/note.m4a") {
  // Android refuse une seconde préparation tant que l'enregistreur n'est ni arrêté ni libéré (#700).
  let prepared = false;
  let binding: Promise<void> = Promise.resolve();
  const fake = {
    // Ce que le natif dit capter : iOS le lit sur `AVAudioRecorder`, Android le pose à `record()`.
    isRecording: false,
    record: vi.fn(() => {
      fake.isRecording = true;
    }),
    pause: vi.fn(() => {
      fake.isRecording = false;
    }),
    stop: vi.fn(async () => {
      prepared = false;
      fake.isRecording = false;
    }),
    prepareToRecordAsync: vi.fn(async () => {
      if (prepared) throw new Error("AudioRecorder has already been prepared");
      const mode = vi.mocked(setAudioModeAsync).mock.lastCall?.[0];
      if (mode?.allowsBackgroundRecording === true && !notificationsGranted) {
        throw notificationsRefused();
      }
      prepared = true;
      await binding;
    }),
    /**
     * L'arrêt que le natif fait SEUL, au plafond : Android passe par `stopRecording()`, qui libère
     * l'enregistreur (`reset()`) — il peut se préparer à nouveau, comme après un `stop()`.
     */
    endNatively() {
      prepared = false;
      fake.isRecording = false;
    },
    hold(): () => void {
      let release = () => {};
      binding = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release();
    },
    uri: uri as string | null,
  };
  return fake;
}

/**
 * Les DEUX enregistreurs du composant (#856), dans l'ordre de leurs hooks : celui qui capte au
 * premier tap, et celui du relais, qui reprend la parole au plafond.
 */
let recorder = fakeRecorder();
let relay = fakeRecorder("file:///cache/relais.m4a");
// L'écouteur de fin que le composant a passé à chacun.
let listeners: ((status: RecordingStatus) => void)[] = [];

/** Le plafond des deux profils (`MAX_*_AUDIO_DURATION_SECONDS`). */
const MAX = 300;

function setup(extra: { notesLeft?: number } = {}) {
  const props = {
    onRecorded: vi.fn(),
    onRecordingChange: vi.fn(),
    onError: vi.fn(),
    onLimitReached: vi.fn(),
    maxDurationSeconds: MAX,
    ...extra,
  };
  const view = renderRn(<CmvAudioRecorder {...props} />);
  // Un nouveau rendu, mêmes props : c'est ainsi que le composant relit l'état natif.
  const refresh = () => view.rerender(<CmvAudioRecorder {...props} />);
  return { ...props, ...view, refresh };
}

function icon(container: HTMLElement, name: string): Element {
  const found = container.querySelector(`[data-icon="${name}"]`);
  if (found?.parentElement == null) throw new Error(`icône ${name} introuvable`);
  return found.parentElement;
}

const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true };

const recordMode = (background: boolean) => ({
  allowsRecording: true,
  playsInSilentMode: true,
  allowsBackgroundRecording: background,
});

/** Monte le composant EN COURS d'enregistrement : c'est l'état natif qui gouverne le bandeau. */
function recording(durationMillis: number) {
  vi.mocked(useAudioRecorderState).mockReturnValue({
    isRecording: true,
    durationMillis,
  } as ReturnType<typeof useAudioRecorderState>);
}

/** Passe le composant monté au repos : c'est ce que fait le natif une fois la capture close. */
function idle() {
  vi.mocked(useAudioRecorderState).mockReturnValue({
    isRecording: false,
    durationMillis: 0,
  } as ReturnType<typeof useAudioRecorderState>);
}

/**
 * Lance une capture depuis le micro, puis rend le bandeau. Le natif ne dit enregistrer qu'APRÈS
 * `record()` : l'état est donc basculé une fois la capture partie, et un nouveau rendu le lit.
 */
async function startCapture(view: ReturnType<typeof setup>) {
  press(icon(view.container, "mic-outline"));
  await waitFor(() => expect(view.onRecordingChange).toHaveBeenCalledWith(true));
  recording(1000);
  view.refresh();
}

beforeEach(() => {
  notificationsGranted = true;
  recorder = fakeRecorder();
  relay = fakeRecorder("file:///cache/relais.m4a");
  listeners = [];
  // Les hooks sont appelés dans le même ordre à chaque rendu : l'un, puis l'autre.
  let calls = 0;
  vi.mocked(useAudioRecorder).mockImplementation((_options, listener) => {
    const slot = calls++ % 2;
    if (listener != null) listeners[slot] = listener;
    return (slot === 0 ? recorder : relay) as unknown as ReturnType<typeof useAudioRecorder>;
  });
  idle();
});

describe("CmvAudioRecorder — démarrage", () => {
  it("passe le mode audio en entier, arrière-plan compris, sans quoi iOS refuse d'enregistrer", async () => {
    const { container, onRecordingChange, onError } = setup();

    press(icon(container, "mic-outline"));

    // Le faux d'`expo-audio` lève comme iOS sur `allowsRecording` seul : c'est #393. Sans
    // `allowsBackgroundRecording`, la capture se met en pause écran verrouillé : c'est #619.
    await waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(setAudioModeAsync).toHaveBeenCalledExactlyOnceWith(recordMode(true));
    expect(onRecordingChange).toHaveBeenCalledWith(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("s'arrête à la permission refusée, sans toucher au mode audio", async () => {
    vi.mocked(requestRecordingPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.permission"),
    );
    expect(setAudioModeAsync).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
    // Un refus est un choix de l'utilisateur, pas une panne : rien à remonter.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("signale un mode audio refusé par le natif, avant d'atteindre le micro", async () => {
    vi.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error("mode refusé"));
    const { container, onError, onRecordingChange } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(onRecordingChange).not.toHaveBeenCalled();
  });
});

/** L'indicateur de chargement : `react-native-web` rend `ActivityIndicator` en `progressbar`. */
function spinner(container: HTMLElement): Element | null {
  return container.querySelector('[role="progressbar"]');
}

describe("CmvAudioRecorder — taps pendant la préparation du micro (#731)", () => {
  it("ne prépare qu'une fois quand on retape pendant la liaison du service", async () => {
    const release = recorder.hold();
    const { container, onRecordingChange, onError } = setup();
    const mic = icon(container, "mic-outline");

    press(mic);
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce());
    press(mic);
    press(mic);
    release();

    await waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce();
    // Le second tap libérait l'enregistreur du premier en pleine préparation.
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(onRecordingChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onError).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // Deux taps dans le même rendu : le second atteint encore le micro, avant que l'indicateur ne le
  // remplace. Seul le `ref` l'arrête.
  it("ne prépare qu'une fois pour deux taps arrivés avant le rendu suivant", async () => {
    const release = recorder.hold();
    const { container, onError } = setup();
    const mic = icon(container, "mic-outline");

    act(() => {
      press(mic);
      press(mic);
    });
    release();

    await waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce();
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("montre que le tap est pris tant que la préparation dure", async () => {
    const release = recorder.hold();
    const { container } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(spinner(container)).not.toBeNull());
    expect(container.querySelector('[data-icon="mic-outline"]')).toBeNull();
    release();
  });

  it("montre le bandeau dès que record() est parti, sans attendre le relevé natif", async () => {
    const { container, onRecordingChange } = setup();

    press(icon(container, "mic-outline"));

    // L'état natif n'est relu que toutes les 500 ms : le micro ne doit pas revenir dans
    // l'intervalle, un tap y trouverait l'enregistreur pris.
    await waitFor(() => expect(onRecordingChange).toHaveBeenCalledWith(true));
    expect(icon(container, "send")).toBeDefined();
    expect(spinner(container)).toBeNull();
    expect(container.querySelector('[data-icon="mic-outline"]')).toBeNull();
  });

  // Une capture coupée par le natif avant tout relevé (appel entrant, micro repris) : sans bandeau,
  // l'attente n'aurait plus d'issue.
  it("garde la corbeille d'une capture que le natif ne confirme jamais", async () => {
    const { container, onRecordingChange } = setup();
    press(icon(container, "mic-outline"));
    await waitFor(() => expect(onRecordingChange).toHaveBeenCalledWith(true));

    press(icon(container, "trash-outline"));

    await waitFor(() => expect(onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(icon(container, "mic-outline")).toBeDefined();
  });

  it("rend le micro après une préparation ratée", async () => {
    recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("micro occupé"));
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(spinner(container)).toBeNull();
    expect(icon(container, "mic-outline")).toBeDefined();
  });

  it("rend le micro après une permission refusée", async () => {
    vi.mocked(requestRecordingPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(spinner(container)).toBeNull();
    expect(icon(container, "mic-outline")).toBeDefined();
  });

  it("rend le micro quand la capture se termine", async () => {
    const view = setup();
    await startCapture(view);

    press(icon(view.container, "send"));
    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    idle();
    view.refresh();

    expect(spinner(view.container)).toBeNull();
    expect(icon(view.container, "mic-outline")).toBeDefined();
  });
});

describe("CmvAudioRecorder — retour au mode lecture sur échec", () => {
  it("rétablit la lecture quand le micro ne se prépare pas", async () => {
    // Le cas du micro déjà pris par une autre app : le mode « record » est posé, puis tout tombe.
    recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("micro occupé"));
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    // Seul le refus des notifications mérite un second essai : un micro pris le resterait.
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce();
  });

  it("rétablit la lecture quand l'arrêt échoue", async () => {
    recording(3000);
    recorder.stop.mockRejectedValueOnce(new Error("arrêt impossible"));
    const { container, onError, onRecordingChange, onRecorded } = setup();

    press(icon(container, "send"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    expect(onRecordingChange).toHaveBeenCalledWith(false);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("libère l'enregistreur quand record() lève après une préparation réussie", async () => {
    recorder.record.mockImplementationOnce(() => {
      throw new Error("service connection not bound");
    });
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(recorder.stop).toHaveBeenCalledOnce();
  });

  it("démarre au second tap après un record() raté", async () => {
    recorder.record.mockImplementationOnce(() => {
      throw new Error("service connection not bound");
    });
    const view = setup();

    press(icon(view.container, "mic-outline"));
    await waitFor(() => expect(view.onError).toHaveBeenCalledOnce());
    press(icon(view.container, "mic-outline"));

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenCalledWith(true));
    expect(view.onError).toHaveBeenCalledOnce();
  });

  it("garde l'erreur d'origine quand la libération de l'enregistreur échoue aussi", async () => {
    const cause = new Error("service connection not bound");
    recorder.record.mockImplementationOnce(() => {
      throw cause;
    });
    recorder.stop.mockRejectedValueOnce(new Error("rien à arrêter"));
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, expect.anything());
  });

  it("garde l'erreur d'origine quand le retour au mode lecture échoue aussi", async () => {
    recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("micro occupé"));
    vi.mocked(setAudioModeAsync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("session audio perdue"));
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(setAudioModeAsync).toHaveBeenCalledTimes(2);
  });
});

describe("CmvAudioRecorder — repli au premier plan (Android, notifications refusées)", () => {
  it("retente sans arrière-plan au lieu d'échouer, sans redemander les notifications", async () => {
    notificationsGranted = false;
    const { container, onRecordingChange, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(vi.mocked(setAudioModeAsync).mock.calls).toEqual([
      [recordMode(true)],
      [recordMode(false)],
    ]);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(onRecordingChange).toHaveBeenCalledWith(true);
    expect(onError).not.toHaveBeenCalled();
    // Un refus de notifications est un choix de l'utilisateur, pas une panne.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("dit sous le minuteur que la note se mettra en pause écran verrouillé", async () => {
    notificationsGranted = false;
    const view = setup();

    await startCapture(view);

    expect(view.getByText("messages.audio.foregroundOnly")).not.toBeNull();
  });

  it("ne dit rien quand la capture tient en arrière-plan", async () => {
    const view = setup();

    await startCapture(view);

    expect(view.getByText("0:01")).not.toBeNull();
    expect(view.queryByText("messages.audio.foregroundOnly")).toBeNull();
  });

  it("signale l'échec du second essai et rend la lecture", async () => {
    const cause = new Error("micro occupé");
    recorder.prepareToRecordAsync
      .mockRejectedValueOnce(notificationsRefused())
      .mockRejectedValueOnce(cause);
    const { container, onError, onRecordingChange } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
    );
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, {
      tags: { platform: "web" },
    });
    expect(recorder.record).not.toHaveBeenCalled();
    expect(onRecordingChange).not.toHaveBeenCalled();
  });
});

describe("CmvAudioRecorder — écran allumé pendant la capture", () => {
  it("laisse la veille au repos", () => {
    setup();

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  // Envoyer comme jeter passent par l'arrêt du natif, qui retombe au repos : le bandeau part, et
  // le maintien avec lui.
  it.each(["send", "trash-outline"])(
    "tient l'écran allumé pendant le bandeau, et le rend après %s",
    async (iconName) => {
      recording(3000);
      const view = setup();
      expect(activateKeepAwakeAsync).toHaveBeenCalledOnce();

      press(icon(view.container, iconName));
      await waitFor(() => expect(view.onRecordingChange).toHaveBeenCalledWith(false));
      expect(deactivateKeepAwake).not.toHaveBeenCalled();
      idle();
      view.refresh();

      expect(deactivateKeepAwake).toHaveBeenCalledOnce();
    },
  );

  it("rend l'écran à la veille quand on quitte en pleine capture", () => {
    recording(3000);
    const { unmount } = setup();

    unmount();

    expect(deactivateKeepAwake).toHaveBeenCalledOnce();
  });
});

describe("CmvAudioRecorder — démontage", () => {
  it("rend le mode lecture quand on quitte en pleine capture", async () => {
    const view = setup();
    await startCapture(view);

    view.unmount();

    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
  });

  it("le rend aussi quand on quitte pendant la préparation du micro", async () => {
    // La préparation attend le service d'Android : le temps de quitter l'écran, mode déjà posé.
    let prepared: () => void = () => undefined;
    recorder.prepareToRecordAsync.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        prepared = resolve;
      }),
    );
    const { container, unmount } = setup();
    press(icon(container, "mic-outline"));
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce());

    unmount();

    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    prepared();
  });

  it("ne touche pas au mode audio quand on quitte au repos", () => {
    const { unmount } = setup();

    unmount();

    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });

  it("ne le rejoue pas après un démarrage échoué", async () => {
    recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("micro occupé"));
    const { container, onError, unmount } = setup();
    press(icon(container, "mic-outline"));
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    vi.mocked(setAudioModeAsync).mockClear();

    unmount();

    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });

  it("ne le rejoue pas après une capture déjà close", async () => {
    const view = setup();
    await startCapture(view);
    press(icon(view.container, "send"));
    await waitFor(() => expect(view.onRecordingChange).toHaveBeenCalledWith(false));
    vi.mocked(setAudioModeAsync).mockClear();

    view.unmount();

    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe("CmvAudioRecorder — remontée à Sentry", () => {
  it("remonte la cause d'un démarrage échoué", async () => {
    const cause = new Error("micro occupé");
    recorder.prepareToRecordAsync.mockRejectedValueOnce(cause);
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, {
      tags: { platform: "web" },
    });
  });

  it("remonte le code natif de la panne, avec la plateforme", async () => {
    const cause = Object.assign(new Error("already prepared"), { code: "ERR_AUDIO_RECORDER" });
    recorder.record.mockImplementationOnce(() => {
      throw cause;
    });
    const { container, onError } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, {
      tags: { platform: "web", code: "ERR_AUDIO_RECORDER" },
    });
  });

  it("remonte la cause d'un arrêt échoué", async () => {
    recording(3000);
    const cause = new Error("arrêt impossible");
    recorder.stop.mockRejectedValueOnce(cause);
    const { container, onError } = setup();

    press(icon(container, "trash-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, {
      tags: { platform: "web" },
    });
  });
});

describe("CmvAudioRecorder — au repos", () => {
  it("n'ouvre pas le micro quand le parent le ferme", () => {
    const onError = vi.fn();
    const { container } = renderRn(
      <CmvAudioRecorder onRecorded={vi.fn()} onError={onError} disabled maxDurationSeconds={MAX} />,
    );

    press(icon(container, "mic-outline"));

    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("CmvAudioRecorder — fin d'enregistrement", () => {
  it("affiche la durée en cours", () => {
    recording(75_000);
    const { getByText } = setup();

    expect(getByText("1:15")).not.toBeNull();
  });

  it("envoie la note, avec sa durée arrondie, et rend la lecture", async () => {
    recording(3400);
    const { container, onRecorded, onRecordingChange, onError } = setup();

    press(icon(container, "send"));

    await waitFor(() =>
      expect(onRecorded).toHaveBeenCalledExactlyOnceWith({
        uri: "file:///cache/note.m4a",
        durationSeconds: 3,
      }),
    );
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    expect(onRecordingChange).toHaveBeenCalledWith(false);
    expect(onError).not.toHaveBeenCalled();
  });

  /**
   * Règle dure n°5 : une note sans fichier ou sans durée n'est pas « une note de 0 s », c'est
   * l'absence de note. Rien ne remonte au parent — et l'arrêt se fait quand même.
   */
  it.each([
    { cas: "la corbeille", iconName: "trash-outline", durationMillis: 3000, uri: "file:///n.m4a" },
    { cas: "une durée arrondie à 0", iconName: "send", durationMillis: 400, uri: "file:///n.m4a" },
    { cas: "un fichier absent", iconName: "send", durationMillis: 3000, uri: null },
  ])("ne transmet rien pour $cas", async ({ iconName, durationMillis, uri }) => {
    recording(durationMillis);
    recorder.uri = uri;
    const { container, onRecorded, onRecordingChange, onError } = setup();

    press(icon(container, iconName));

    await waitFor(() => expect(onRecordingChange).toHaveBeenCalledWith(false));
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

/**
 * La fin que le natif annonce, à l'écouteur de l'enregistreur `slot` : 0 pour celui qui capte au
 * premier tap, 1 pour le relais.
 */
function nativeEnd(slot: 0 | 1, status: Partial<RecordingStatus> = {}) {
  const listener = listeners[slot];
  if (listener == null) throw new Error(`aucun écouteur de fin passé à l'enregistreur ${slot}`);
  // Une erreur levée en pleine capture (`onError`) ne libère rien : l'enregistreur reste préparé.
  if (status.hasError !== true) (slot === 0 ? recorder : relay).endNatively();
  act(() =>
    listener({
      id: `rec-${slot}`,
      isFinished: true,
      hasError: false,
      error: null,
      url: slot === 0 ? "file:///cache/note.m4a" : "file:///cache/relais.m4a",
      ...status,
    }),
  );
}

/** Le texte que le bandeau affiche après `n` relais. */
const relayedLine = "messages.audio.relayed";

describe("CmvAudioRecorder — plafond du profil (#856)", () => {
  beforeEach(() => {
    // Seule l'horloge est figée : c'est elle qui mesure une note close par le natif.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Le natif tient le plafond : Android suspend les timers JS écran verrouillé, pas la capture.
  it("confie le plafond au natif", async () => {
    const { container } = setup();

    press(icon(container, "mic-outline"));

    await waitFor(() =>
      expect(recorder.record).toHaveBeenCalledExactlyOnceWith({ forDuration: MAX }),
    );
  });

  it("borne au plafond la durée d'un tap envoyer relevé au-delà", async () => {
    // Relevé toutes les 500 ms puis arrondi : 300,6 s rendait 301, refusé à l'envoi.
    recording(MAX * 1000 + 600);
    const { container, onRecorded } = setup();

    press(icon(container, "send"));

    await waitFor(() =>
      expect(onRecorded).toHaveBeenCalledExactlyOnceWith({
        uri: "file:///cache/note.m4a",
        durationSeconds: MAX,
      }),
    );
  });

  it("ne clôt pas une seconde fois sur la fin que son propre arrêt annonce", async () => {
    const view = setup();
    await startCapture(view);
    press(icon(view.container, "send"));
    await waitFor(() => expect(view.onRecorded).toHaveBeenCalledOnce());

    nativeEnd(0);
    // Le relais libéré annonce sa fin, en échec : elle ne concerne aucune note.
    nativeEnd(1, { hasError: true, error: "stop failed", url: null });

    expect(view.onRecorded).toHaveBeenCalledOnce();
    expect(view.onRecordingChange).toHaveBeenCalledTimes(2);
    expect(view.onError).not.toHaveBeenCalled();
  });

  it("ignore une fin native hors capture", () => {
    const { onRecorded, onRecordingChange } = setup();

    nativeEnd(0);

    expect(onRecorded).not.toHaveBeenCalled();
    expect(onRecordingChange).not.toHaveBeenCalled();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });

  it("ignore une fin native arrivée pendant la préparation du micro", async () => {
    const release = recorder.hold();
    const { container, onRecorded, onRecordingChange } = setup();
    press(icon(container, "mic-outline"));
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce());

    // En retard sur une capture déjà close : elle ne concerne pas celle qui se prépare.
    nativeEnd(0);
    release();

    await waitFor(() => expect(onRecordingChange).toHaveBeenCalledExactlyOnceWith(true));
    expect(onRecorded).not.toHaveBeenCalled();
    expect(icon(container, "send")).toBeDefined();
  });

  // Android `onError` (serveur média mort) n'arrête rien et garde l'enregistreur préparé ; iOS
  // annonce une fin sans fichier ni erreur quand ses services média redémarrent.
  it.each([
    { cas: "en erreur", status: { hasError: true, error: "stop failed", url: null } },
    { cas: "sans fichier", status: { hasError: false, error: null, url: null } },
  ])(
    "signale une fin native $cas, libère les enregistreurs et ne transmet rien",
    async ({ status }) => {
      const view = setup();
      await startCapture(view);
      idle();
      vi.setSystemTime(MAX * 1000);

      nativeEnd(0, status);

      await waitFor(() =>
        expect(view.onError).toHaveBeenCalledExactlyOnceWith("messages.audio.recordError"),
      );
      expect(view.onRecorded).not.toHaveBeenCalled();
      expect(view.onLimitReached).not.toHaveBeenCalled();
      expect(relay.record).not.toHaveBeenCalled();
      expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
      expect(view.onRecordingChange).toHaveBeenLastCalledWith(false);
      expect(Sentry.captureException).toHaveBeenCalledOnce();
      // Sans quoi le tap suivant trouverait l'enregistreur encore préparé (#700) — et le relais
      // garderait, sur Android, le service de premier plan.
      expect(recorder.stop).toHaveBeenCalledOnce();
      expect(relay.stop).toHaveBeenCalledOnce();
    },
  );

  it("démarre au tap suivant une fin native en erreur", async () => {
    const view = setup();
    await startCapture(view);
    // Le faux suit Android : la préparation reste posée tant que rien ne libère l'enregistreur.
    idle();
    nativeEnd(0, { hasError: true, error: "media server died", url: null });
    await waitFor(() => expect(view.onError).toHaveBeenCalledOnce());

    press(icon(view.container, "mic-outline"));

    await waitFor(() => expect(recorder.record).toHaveBeenCalledTimes(2));
    expect(view.onError).toHaveBeenCalledOnce();
  });
});

describe("CmvAudioRecorder — relais au plafond (#856)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  });

  it("prépare le relais une fois la note partie, sans la retarder", async () => {
    const view = setup();

    await startCapture(view);

    expect(relay.prepareToRecordAsync).toHaveBeenCalledOnce();
    expect(relay.prepareToRecordAsync.mock.invocationCallOrder[0]).toBeGreaterThan(
      recorder.record.mock.invocationCallOrder[0] ?? 0,
    );
    // iOS n'a pas de service de premier plan à garder : préparé suffit, rien ne capte encore.
    expect(relay.record).not.toHaveBeenCalled();
  });

  // Le service de premier plan d'Android s'arrête avec le dernier enregistreur démarré, et ne se
  // relance pas écran verrouillé : le relais est démarré puis mis en pause, pendant la note.
  it("amorce le relais sur Android, en le démarrant puis en le mettant en pause", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    const view = setup();

    await startCapture(view);

    expect(relay.record).toHaveBeenCalledExactlyOnceWith();
    expect(relay.pause).toHaveBeenCalledOnce();
    expect(relay.pause.mock.invocationCallOrder[0]).toBeGreaterThan(
      relay.record.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("transmet la note close et poursuit la capture sur le relais, sans couper", async () => {
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(MAX * 1000 + 700);

    // Le fichier est celui que nomme la fin native.
    nativeEnd(0, { url: "file:///cache/plafond.m4a" });

    expect(relay.record).toHaveBeenCalledExactlyOnceWith({ forDuration: MAX });
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/plafond.m4a",
      durationSeconds: MAX,
    });
    // La capture continue : ni fin dite au parent, ni retour au mode lecture, ni message de plafond.
    expect(view.onRecordingChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(setAudioModeAsync).not.toHaveBeenCalledWith(PLAYBACK_MODE);
    expect(view.onLimitReached).not.toHaveBeenCalled();
    expect(view.getByText(relayedLine)).not.toBeNull();
    expect(icon(view.container, "send")).toBeDefined();
    // L'enregistreur qui vient de finir se prépare pour le relais suivant.
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2));
  });

  it("cumule le minuteur sur les notes de la capture", async () => {
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(MAX * 1000);
    nativeEnd(0);

    // Le relais en est à 1 s : 5 min déjà parties, plus celle-ci.
    view.refresh();

    expect(view.getByText("5:01")).not.toBeNull();
  });

  it("enchaîne autant de relais que la parole dure, en alternant les enregistreurs", async () => {
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(MAX * 1000);
    nativeEnd(0);
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2));
    vi.setSystemTime(2 * MAX * 1000);

    nativeEnd(1);

    expect(recorder.record).toHaveBeenLastCalledWith({ forDuration: MAX });
    expect(view.onRecorded).toHaveBeenLastCalledWith({
      uri: "file:///cache/relais.m4a",
      durationSeconds: MAX,
    });
    expect(view.onRecorded).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalledTimes(2));
  });

  it("un tap envoyer après un relais transmet la note en cours et libère le relais suivant", async () => {
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(MAX * 1000);
    nativeEnd(0);
    await waitFor(() => expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2));
    recording(12_000);
    view.refresh();

    press(icon(view.container, "send"));

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(view.onRecorded).toHaveBeenLastCalledWith({
      uri: "file:///cache/relais.m4a",
      durationSeconds: 12,
    });
    expect(relay.stop).toHaveBeenCalledOnce();
    // Le relais préparé n'a plus de suite à prendre.
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
  });

  it("libère le relais quand la capture est jetée", async () => {
    const view = setup();
    await startCapture(view);

    press(icon(view.container, "trash-outline"));

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(relay.stop).toHaveBeenCalledOnce();
    expect(view.onRecorded).not.toHaveBeenCalled();
  });

  // Le mode lecture retire le service de premier plan aux enregistreurs d'Android : un relais amorcé
  // libéré APRÈS ne s'en désinscrirait plus, et le service resterait avec sa notification.
  it("libère le relais avant de rendre le mode lecture", async () => {
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());

    press(icon(view.container, "send"));

    await waitFor(() => expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE));
    const playback = vi
      .mocked(setAudioModeAsync)
      .mock.calls.findIndex(([mode]) => mode.allowsRecording === false);
    expect(relay.stop.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setAudioModeAsync).mock.invocationCallOrder[playback] ?? 0,
    );
  });

  // Sans le service, expo-audio relance au premier plan tout enregistreur en pause : un relais amorcé
  // capterait par-dessus la note dès le retour dans l'app.
  it("n'amorce pas le relais d'une capture au premier plan seul sur Android", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    notificationsGranted = false;
    const view = setup();

    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());

    expect(relay.record).not.toHaveBeenCalled();
    expect(relay.pause).not.toHaveBeenCalled();
  });

  it("ne signale pas l'échec d'une préparation du relais en vol au démontage", async () => {
    let fail: (error: Error) => void = () => {};
    relay.prepareToRecordAsync.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());

    view.unmount();
    await act(async () => fail(new Error("AudioRecorder has been released")));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // iOS clôt la note sur une interruption, et annonce cette fin comme une autre, fichier compris.
  it("garde une note close bien avant le plafond, sans relais ni avis de plafond", async () => {
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(40_000);

    nativeEnd(0);

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/note.m4a",
      durationSeconds: 40,
    });
    expect(relay.record).not.toHaveBeenCalled();
    expect(view.onLimitReached).not.toHaveBeenCalled();
  });

  // Sans service de premier plan, Android ne donne que du silence à un micro ouvert en arrière-plan.
  it("ne relaie pas une capture au premier plan seul quand l'app est passée derrière", async () => {
    notificationsGranted = false;
    const appState = vi.spyOn(AppState, "currentState", "get").mockReturnValue("background");
    const view = setup();
    await startCapture(view);
    vi.setSystemTime(MAX * 1000);
    recording(MAX * 1000 - 400);
    view.refresh();

    nativeEnd(0);

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(relay.record).not.toHaveBeenCalledWith({ forDuration: MAX });
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/note.m4a",
      durationSeconds: MAX,
    });
    expect(view.onLimitReached).toHaveBeenCalledOnce();
    appState.mockRestore();
  });

  it("relaie une capture au premier plan seul tant que l'app est à l'écran", async () => {
    notificationsGranted = false;
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());
    vi.setSystemTime(MAX * 1000);
    recording(MAX * 1000 - 400);
    view.refresh();

    nativeEnd(0);

    expect(relay.record).toHaveBeenCalledExactlyOnceWith({ forDuration: MAX });
  });

  // Un fil JS occupé rend un relevé en retard : ce n'est pas une pause, la note est au plafond.
  it("ne prend pas un relevé en retard pour une pause de la capture au premier plan seul", async () => {
    notificationsGranted = false;
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());
    recording(MAX * 1000 - 3000);
    view.refresh();
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    expect(relay.record).toHaveBeenCalledExactlyOnceWith({ forDuration: MAX });
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/note.m4a",
      durationSeconds: MAX,
    });
  });

  // Le natif clôt au plafond de l'horloge, pause comprise : la note n'a capté que ce qui précède.
  it("mesure au relevé une capture au premier plan seul mise en pause, sans avis de plafond", async () => {
    notificationsGranted = false;
    const view = setup();
    await startCapture(view);
    recording(59_500);
    view.refresh();
    // Écran verrouillé : expo-audio met la capture en pause, le relevé ne dit plus qu'il capte.
    idle();
    view.refresh();
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    await waitFor(() =>
      expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
        uri: "file:///cache/note.m4a",
        durationSeconds: 60,
      }),
    );
    expect(relay.record).not.toHaveBeenCalledWith({ forDuration: MAX });
    expect(view.onLimitReached).not.toHaveBeenCalled();
  });

  // Android attend jusqu'à 5 s son service : la préparation d'une capture close peut aboutir pendant
  // la suivante. Elle passe d'abord, libère l'enregistreur, et la capture neuve prépare le sien.
  it("prépare le relais d'une capture neuve après celle d'une capture déjà close", async () => {
    const releaseBinding = relay.hold();
    const view = setup();
    await startCapture(view);
    press(icon(view.container, "trash-outline"));
    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    idle();
    view.refresh();
    await startCapture(view);
    // La capture neuve attend la préparation en cours au lieu de la croiser.
    expect(relay.prepareToRecordAsync).toHaveBeenCalledOnce();

    await act(async () => releaseBinding());
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalledTimes(2));
    expect(relay.stop).toHaveBeenCalledOnce();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    vi.setSystemTime(MAX * 1000);
    nativeEnd(0);

    expect(relay.record).toHaveBeenCalledExactlyOnceWith({ forDuration: MAX });
    expect(view.onLimitReached).not.toHaveBeenCalled();
  });

  // iOS ne lève pas quand `AVAudioRecorder` refuse de démarrer : seul `isRecording` le dit.
  it("s'arrête au plafond si le relais ne capte pas, et garde la note", async () => {
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());
    relay.record.mockImplementationOnce(() => undefined);
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/note.m4a",
      durationSeconds: MAX,
    });
    expect(view.onLimitReached).toHaveBeenCalledOnce();
    // Le relais muet est libéré : il ne garde ni le micro ni le service.
    expect(relay.stop).toHaveBeenCalled();
  });

  // Le relais change d'enregistreur avant le rendu qui suit : un tap dans l'intervalle arrête le
  // bon, au lieu de laisser le relais capter, capture close, sans que rien ne l'arrête jamais.
  it("un tap envoyer entre le relais et le rendu suivant arrête l'enregistreur qui capte", async () => {
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());
    vi.setSystemTime(MAX * 1000);
    recorder.endNatively();

    // Hors `act` : le rendu du relais n'a pas encore eu lieu quand le tap arrive.
    listeners[0]?.({
      id: "rec-0",
      isFinished: true,
      hasError: false,
      error: null,
      url: "file:///cache/note.m4a",
    });
    press(icon(view.container, "send"));

    await waitFor(() => expect(view.onRecordingChange).toHaveBeenLastCalledWith(false));
    expect(relay.stop).toHaveBeenCalled();
    expect(relay.isRecording).toBe(false);
  });

  // Android peut signaler une panne du relais aussitôt repris, avant le rendu qui suit le relais.
  it("entend la panne du relais annoncée avant le rendu suivant", async () => {
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());
    vi.setSystemTime(MAX * 1000);
    recorder.endNatively();

    // Hors `act`, l'une après l'autre : aucun rendu entre la fin de la note et la panne du relais.
    listeners[0]?.({
      id: "rec-0",
      isFinished: true,
      hasError: false,
      error: null,
      url: "file:///cache/note.m4a",
    });
    listeners[1]?.({
      id: "rec-1",
      isFinished: true,
      hasError: true,
      error: "MEDIA_ERROR_SERVER_DIED",
      url: null,
    });

    await waitFor(() => expect(view.onError).toHaveBeenCalledWith("messages.audio.recordError"));
    expect(view.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  // Sans options, iOS réutilise son `AVAudioRecorder`, donc le fichier de la note qui part.
  it("prépare chaque note avec le preset, pour qu'iOS lui ouvre un fichier neuf", async () => {
    const view = setup();
    await startCapture(view);
    await waitFor(() => expect(relay.prepareToRecordAsync).toHaveBeenCalled());

    expect(recorder.prepareToRecordAsync).toHaveBeenCalledWith(RecordingPresets.HIGH_QUALITY);
    expect(relay.prepareToRecordAsync).toHaveBeenCalledWith(RecordingPresets.HIGH_QUALITY);
  });

  it("ne dit pas le plafond quand la note close ne part pas", async () => {
    const view = setup({ notesLeft: 1 });
    await startCapture(view);
    vi.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error("session audio perdue"));
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    await waitFor(() => expect(view.onError).toHaveBeenCalledWith("messages.audio.recordError"));
    expect(view.onRecorded).not.toHaveBeenCalled();
    expect(view.onLimitReached).not.toHaveBeenCalled();
  });

  // Le débrief n'a plus qu'une place : rien ne prend la suite, la note part et la capture s'arrête.
  it("s'arrête au plafond sur la dernière note possible, et le dit", async () => {
    const view = setup({ notesLeft: 1 });
    await startCapture(view);
    // Le relevé est retombé à 0 avec l'arrêt natif : seule l'horloge sait combien a duré la note.
    idle();
    vi.setSystemTime(MAX * 1000 + 700);

    nativeEnd(0);

    await waitFor(() =>
      expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
        uri: "file:///cache/note.m4a",
        durationSeconds: MAX,
      }),
    );
    expect(relay.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(view.onLimitReached).toHaveBeenCalledOnce();
    // Il n'y a plus rien à arrêter : le natif l'a fait.
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(PLAYBACK_MODE);
    expect(view.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(view.onError).not.toHaveBeenCalled();
    expect(icon(view.container, "mic-outline")).toBeDefined();
  });

  it("relaie tant qu'il reste une place, puis s'arrête sur la dernière", async () => {
    const view = setup({ notesLeft: 2 });
    await startCapture(view);
    vi.setSystemTime(MAX * 1000);
    nativeEnd(0);
    expect(relay.record).toHaveBeenCalledOnce();
    vi.setSystemTime(2 * MAX * 1000);

    nativeEnd(1);

    await waitFor(() => expect(view.onLimitReached).toHaveBeenCalledOnce());
    expect(view.onRecorded).toHaveBeenCalledTimes(2);
    // La seconde note était la dernière : rien ne s'est préparé pour une troisième.
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledOnce();
    expect(view.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it("démarre quand même si le relais ne se prépare pas, et s'arrête au plafond", async () => {
    const cause = new Error("relais refusé");
    relay.prepareToRecordAsync.mockRejectedValueOnce(cause);
    const view = setup();
    await startCapture(view);
    expect(view.onError).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause, expect.anything());
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    await waitFor(() => expect(view.onLimitReached).toHaveBeenCalledOnce());
    expect(view.onRecorded).toHaveBeenCalledOnce();
    expect(relay.record).not.toHaveBeenCalled();
  });

  it("s'arrête au plafond si le relais refuse de reprendre, et garde la note", async () => {
    const view = setup();
    await startCapture(view);
    relay.record.mockImplementationOnce(() => {
      throw new Error("service connection not bound");
    });
    vi.setSystemTime(MAX * 1000);

    nativeEnd(0);

    await waitFor(() => expect(view.onLimitReached).toHaveBeenCalledOnce());
    expect(view.onRecorded).toHaveBeenCalledExactlyOnceWith({
      uri: "file:///cache/note.m4a",
      durationSeconds: MAX,
    });
    expect(relay.stop).toHaveBeenCalledOnce();
    expect(view.onError).not.toHaveBeenCalled();
  });
});

describe("CmvAudioRecorder — accessibilité (#199)", () => {
  // Trois icônes seules : sans nom, un lecteur d'écran annoncerait trois boutons muets.
  it("nomme le micro, puis la corbeille et l'envoi du bandeau", async () => {
    const view = setup();
    expect(view.getByRole("button", { name: "messages.audio.record" })).toBe(
      icon(view.container, "mic-outline"),
    );

    await startCapture(view);

    expect(view.getByRole("button", { name: "messages.audio.discard" })).toBe(
      icon(view.container, "trash-outline"),
    );
    expect(view.getByRole("button", { name: "messages.audio.send" })).toBe(
      icon(view.container, "send"),
    );
  });
});

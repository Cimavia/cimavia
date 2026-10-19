import * as Sentry from "@sentry/react-native";
import { waitFor } from "@testing-library/react";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
 */
function fakeRecorder() {
  return {
    record: vi.fn(),
    stop: vi.fn(async () => undefined),
    prepareToRecordAsync: vi.fn(async () => {
      const mode = vi.mocked(setAudioModeAsync).mock.lastCall?.[0];
      if (mode?.allowsBackgroundRecording === true && !notificationsGranted) {
        throw notificationsRefused();
      }
    }),
    uri: "file:///cache/note.m4a" as string | null,
  };
}

let recorder = fakeRecorder();

function setup() {
  const props = { onRecorded: vi.fn(), onRecordingChange: vi.fn(), onError: vi.fn() };
  const view = renderRn(<CmvAudioRecorder {...props} />);
  return { ...props, ...view };
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
  view.rerender(
    <CmvAudioRecorder
      onRecorded={view.onRecorded}
      onRecordingChange={view.onRecordingChange}
      onError={view.onError}
    />,
  );
}

beforeEach(() => {
  notificationsGranted = true;
  recorder = fakeRecorder();
  vi.mocked(useAudioRecorder).mockReturnValue(
    recorder as unknown as ReturnType<typeof useAudioRecorder>,
  );
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
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause);
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
  it.each([
    "send",
    "trash-outline",
  ])("tient l'écran allumé pendant le bandeau, et le rend après %s", async (iconName) => {
    recording(3000);
    const view = setup();
    expect(activateKeepAwakeAsync).toHaveBeenCalledOnce();

    press(icon(view.container, iconName));
    await waitFor(() => expect(view.onRecordingChange).toHaveBeenCalledWith(false));
    expect(deactivateKeepAwake).not.toHaveBeenCalled();
    idle();
    view.rerender(<CmvAudioRecorder onRecorded={view.onRecorded} />);

    expect(deactivateKeepAwake).toHaveBeenCalledOnce();
  });

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
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause);
  });

  it("remonte la cause d'un arrêt échoué", async () => {
    recording(3000);
    const cause = new Error("arrêt impossible");
    recorder.stop.mockRejectedValueOnce(cause);
    const { container, onError } = setup();

    press(icon(container, "trash-outline"));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause);
  });
});

describe("CmvAudioRecorder — au repos", () => {
  it("n'ouvre pas le micro quand le parent le ferme", () => {
    const onError = vi.fn();
    const { container } = renderRn(
      <CmvAudioRecorder onRecorded={vi.fn()} onError={onError} disabled />,
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

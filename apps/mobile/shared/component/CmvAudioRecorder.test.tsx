import * as Sentry from "@sentry/react-native";
import { waitFor } from "@testing-library/react";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { press, renderRn } from "@/test/render";
import { CmvAudioRecorder } from "./CmvAudioRecorder";

/**
 * Un enregistreur STABLE d'un rendu à l'autre : le faux par défaut en fabrique un neuf à chaque
 * appel du hook, et l'assertion porterait alors sur un objet que le composant n'a jamais touché.
 */
function fakeRecorder() {
  return {
    record: vi.fn(),
    stop: vi.fn(async () => undefined),
    prepareToRecordAsync: vi.fn(async () => undefined),
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

/** Monte le composant EN COURS d'enregistrement : c'est l'état natif qui gouverne le bandeau. */
function recording(durationMillis: number) {
  vi.mocked(useAudioRecorderState).mockReturnValue({
    isRecording: true,
    durationMillis,
  } as ReturnType<typeof useAudioRecorderState>);
}

beforeEach(() => {
  recorder = fakeRecorder();
  vi.mocked(useAudioRecorder).mockReturnValue(
    recorder as unknown as ReturnType<typeof useAudioRecorder>,
  );
  vi.mocked(useAudioRecorderState).mockReturnValue({
    isRecording: false,
    durationMillis: 0,
  } as ReturnType<typeof useAudioRecorderState>);
});

describe("CmvAudioRecorder — démarrage", () => {
  it("passe le mode audio en entier, sans quoi iOS refuse d'enregistrer", async () => {
    const { container, onRecordingChange, onError } = setup();

    press(icon(container, "mic-outline"));

    // Le faux d'`expo-audio` lève comme iOS sur `allowsRecording` seul : c'est #393.
    await waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
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

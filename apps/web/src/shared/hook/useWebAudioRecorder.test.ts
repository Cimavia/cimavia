import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebAudioRecorder } from "./useWebAudioRecorder";

const ERROR_KEYS = {
  permission: "message.audio.permission",
  unsupported: "message.audio.unsupported",
};

/**
 * jsdom n'a ni micro ni `MediaRecorder`. Le faux ne fait que ce que le navigateur ferait : il
 * garde ses rappels, et `stop()` les déclenche dans l'ordre réel — les données, PUIS l'arrêt.
 */
class FakeRecorder {
  static supported = new Set(["audio/mp4"]);
  static last: FakeRecorder | null = null;
  static isTypeSupported(mime: string) {
    return FakeRecorder.supported.has(mime);
  }

  /** Le navigateur rend `onstop` en tâche, pas pendant `stop()` : un second clic arrive avant. */
  static asyncStop = false;
  state: "recording" | "inactive" = "recording";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly mimeType: string;
  chunks: Blob[] = [];

  constructor(_stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
    FakeRecorder.last = this;
  }

  start() {}

  stop() {
    // Spécifié : `stop()` sur un enregistreur inactif ne fait rien.
    if (this.state === "inactive") return;
    this.state = "inactive";
    if (FakeRecorder.asyncStop) {
      queueMicrotask(() => this.flush());
      return;
    }
    this.flush();
  }

  flush() {
    for (const data of this.chunks) this.ondataavailable?.({ data });
    this.onstop?.();
  }
}

function lastRecorder(): FakeRecorder {
  if (FakeRecorder.last == null) throw new Error("aucun enregistreur créé");
  return FakeRecorder.last;
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();

function setup(allowedMimeTypes: readonly string[] = ["audio/mp4"], maxDurationSeconds?: number) {
  const onRecorded = vi.fn();
  const onError = vi.fn();
  const onLimitReached = vi.fn();
  const hook = renderHook(() =>
    useWebAudioRecorder({
      allowedMimeTypes,
      errorKeys: ERROR_KEYS,
      onRecorded,
      onError,
      ...(maxDurationSeconds == null ? {} : { maxDurationSeconds }),
      onLimitReached,
    }),
  );
  return { ...hook, onRecorded, onError, onLimitReached };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  FakeRecorder.supported = new Set(["audio/mp4"]);
  FakeRecorder.last = null;
  FakeRecorder.asyncStop = false;
  // Une piste terminée fait émettre `stop` à l'enregistreur : c'est ce qui rendait le démontage
  // dangereux (#340), et ce que le faux doit reproduire pour que le test morde.
  track.stop.mockReset().mockImplementation(() => FakeRecorder.last?.flush());
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useWebAudioRecorder — la capture", () => {
  it("compte les secondes, puis remet la capture et libère le micro", async () => {
    const { result, onRecorded } = setup();

    await act(() => result.current.start());
    expect(result.current.isRecording).toBe(true);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.seconds).toBe(3);

    const chunk = new Blob(["son"]);
    lastRecorder().chunks = [new Blob([]), chunk];
    act(() => result.current.stop(true));

    expect(result.current.isRecording).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    const { blob, durationSeconds } = onRecorded.mock.lastCall?.[0] ?? {};
    expect(durationSeconds).toBe(3);
    // Un morceau vide n'est pas du son : seul le vrai est gardé.
    expect(blob.size).toBe(chunk.size);
    expect(blob.type).toBe("audio/mp4");
  });

  it("n'envoie rien d'une capture de moins d'une seconde", async () => {
    const { result, onRecorded } = setup();
    await act(() => result.current.start());

    act(() => result.current.stop(true));

    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("jette la capture annulée, micro libéré", async () => {
    const { result, onRecorded } = setup();
    await act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5000));

    act(() => result.current.stop(false));

    expect(onRecorded).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    // Le compteur ne tourne plus une fois arrêté.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(5);
  });

  it("n'envoie qu'une capture sur un double clic, avant que le navigateur ait fini d'arrêter", async () => {
    FakeRecorder.asyncStop = true;
    const { result, onRecorded } = setup();
    await act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));

    await act(async () => {
      result.current.stop(true);
      result.current.stop(true);
    });

    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it("ne fait rien quand on arrête un enregistrement qui n'a pas commencé", () => {
    const { result, onRecorded } = setup();

    act(() => result.current.stop(true));

    expect(onRecorded).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it("libère le micro si l'écran disparaît en cours d'enregistrement", async () => {
    const { result, unmount } = setup();
    await act(() => result.current.start());

    unmount();

    expect(track.stop).toHaveBeenCalled();
  });

  it("n'envoie rien d'une capture quittée en route (#340)", async () => {
    const { result, unmount, onRecorded } = setup();
    await act(() => result.current.start());
    act(() => vi.advanceTimersByTime(4000));
    lastRecorder().chunks = [new Blob(["moitié de phrase"])];

    unmount();

    expect(track.stop).toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });
});

describe("useWebAudioRecorder — le plafond de durée", () => {
  it("s'arrête au plafond en gardant la capture, et le dit", async () => {
    const { result, onRecorded, onLimitReached } = setup(["audio/mp4"], 3);
    await act(() => result.current.start());
    lastRecorder().chunks = [new Blob(["son"])];

    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.isRecording).toBe(false);
    expect(onLimitReached).toHaveBeenCalledOnce();
    expect(onRecorded).toHaveBeenCalledOnce();
    expect(onRecorded.mock.lastCall?.[0].durationSeconds).toBe(3);
    act(() => vi.advanceTimersByTime(5000));
    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it("ne dépasse jamais le plafond, même si l'horloge a dérivé", async () => {
    const { result, onRecorded } = setup(["audio/mp4"], 3);
    await act(() => result.current.start());
    lastRecorder().chunks = [new Blob(["son"])];

    // Le minuteur a du retard : 3,6 s d'horloge s'arrondiraient à 4 s, que l'envoi refuserait.
    act(() => vi.setSystemTime(Date.now() + 3600));
    act(() => vi.advanceTimersByTime(3000));

    expect(onRecorded.mock.lastCall?.[0].durationSeconds).toBe(3);
  });

  it("laisse enregistrer sans limite quand aucun plafond n'est donné", async () => {
    const { result, onLimitReached } = setup();
    await act(() => result.current.start());

    act(() => vi.advanceTimersByTime(600_000));

    expect(result.current.isRecording).toBe(true);
    expect(onLimitReached).not.toHaveBeenCalled();
  });
});

describe("useWebAudioRecorder — les refus", () => {
  it("dit que le micro est refusé", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { result, onError } = setup();

    await act(() => result.current.start());

    expect(onError).toHaveBeenCalledWith(ERROR_KEYS.permission);
    expect(result.current.isRecording).toBe(false);
  });

  it("n'est pas disponible quand le navigateur ne produit aucun format accepté", async () => {
    FakeRecorder.supported = new Set(["audio/webm"]);
    const { result, onError } = setup(["audio/mp4"]);
    expect(result.current.isAvailable).toBe(false);

    // Le bouton est éteint ; si l'appel passe quand même, le micro est rendu aussitôt.
    await act(() => result.current.start());

    expect(onError).toHaveBeenCalledWith(ERROR_KEYS.unsupported);
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });
});

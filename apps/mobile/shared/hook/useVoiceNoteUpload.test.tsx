import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RecordedAudio } from "@/shared/component";
import { useVoiceNoteUpload } from "./useVoiceNoteUpload";

const note = (index: number): RecordedAudio => ({
  uri: `file://note-${index}.m4a`,
  durationSeconds: 300,
});

/** Un envoi que le test termine à la main : c'est l'ordre des fins qui est en jeu. */
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Le hook, avec un envoi par note que le test pilote : `sends[i]` termine la note `i + 1`. */
function renderUpload() {
  const sends = [deferred(), deferred()];
  const upload = vi.fn((audio: RecordedAudio) => {
    const index = Number(/note-(\d)/.exec(audio.uri)?.[1]) - 1;
    return sends[index]?.promise ?? Promise.resolve();
  });
  const onSuccess = vi.fn();
  const view = renderHook(() => useVoiceNoteUpload("scope-1", upload, onSuccess), { wrapper });
  return { ...view, sends, upload, onSuccess };
}

describe("useVoiceNoteUpload", () => {
  it("garde l'échec d'une note quand la suivante, relayée, réussit", async () => {
    const { result, sends } = renderUpload();
    const failure = new Error("stockage injoignable");

    act(() => result.current.send(note(1)));
    act(() => result.current.send(note(2)));
    await act(async () => sends[0]?.reject(failure));
    await act(async () => sends[1]?.resolve());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBe(failure);
  });

  it("n'envoie une note qu'une fois la précédente terminée, même en échec", async () => {
    const { result, sends, upload } = renderUpload();

    act(() => result.current.send(note(1)));
    act(() => result.current.send(note(2)));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    // La note 2 attend : « envoi en cours » couvre toute la file.
    expect(result.current.isPending).toBe(true);

    await act(async () => sends[0]?.reject(new Error("panne")));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1]?.[0]).toEqual(note(2));
    expect(result.current.isPending).toBe(true);
  });

  it("efface l'échec retenu à la demande, et seulement à la demande", async () => {
    const { result, sends, onSuccess } = renderUpload();

    act(() => result.current.send(note(1)));
    await act(async () => sends[0]?.reject(new Error("panne")));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("n'annonce aucun échec quand toutes les notes partent", async () => {
    const { result, sends, onSuccess } = renderUpload();

    act(() => result.current.send(note(1)));
    await act(async () => sends[0]?.resolve());

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(result.current.error).toBeNull();
  });
});

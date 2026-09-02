import type { MessageDto } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import { useMarkRead, useMessages, useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";
import { MediaRejectedError } from "@/feature/message/util/media.util";
import { CmvButton, type RecordedAudio } from "@/shared/component";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les hooks du fil sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI est
 * ce que le fil décide — quel état il montre, quand il marque lu, et quelle erreur l'emporte.
 */
vi.mock("@/feature/message/hook/useConversation", () => ({
  useMessages: vi.fn(),
  useSendMessage: vi.fn(),
  useMarkRead: vi.fn(),
}));
vi.mock("@/feature/message/hook/useMessageMedia", () => ({ useSendMessageMedia: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "me" } } }) },
}));

/**
 * Seul `CmvAudioRecorder` est remplacé, par un bouton qui rend un audio tout fait. Le vrai a
 * besoin d'un micro : `useAudioRecorderState` ne peut pas basculer en enregistrement sous un
 * runtime sans pont natif, donc `onRecorded` serait hors d'atteinte. Ce qui s'éprouve ici est ce
 * que le FIL fait d'une note vocale rendue, pas la façon dont le micro la produit.
 */
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CmvAudioRecorder: ({ onRecorded }: { onRecorded: (audio: RecordedAudio) => void }) => (
    <CmvButton
      label="enregistrer"
      onPress={() => onRecorded({ uri: "file:///note.m4a", durationSeconds: 3 })}
    />
  ),
}));

const markRead = vi.fn();
const refetch = vi.fn();
const pickAndSend = vi.fn();

function message(overrides: Partial<MessageDto>): MessageDto {
  return {
    id: "m-1",
    senderId: "coach-1",
    type: "TEXT",
    content: "bien joué",
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as MessageDto;
}

function mockMessages(state: Record<string, unknown>): void {
  vi.mocked(useMessages).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch,
    ...state,
  } as unknown as ReturnType<typeof useMessages>);
}

beforeEach(() => {
  mockMessages({});
  vi.mocked(useSendMessage).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSendMessage>);
  vi.mocked(useMarkRead).mockReturnValue({ mutate: markRead } as unknown as ReturnType<
    typeof useMarkRead
  >);
  pickAndSend.mockResolvedValue([]);
  vi.mocked(useSendMessageMedia).mockReturnValue({
    pickAndSend,
    recordAndSend: vi.fn(),
    isUploading: false,
    step: null,
    audioError: null,
  } as unknown as ReturnType<typeof useSendMessageMedia>);
});

const base = {
  conversationId: "cv-1",
  isResolving: false,
  hasResolveError: false,
  onRetryResolve: vi.fn(),
};

describe("ConversationThread", () => {
  it("attend tant que le fil n'est pas résolu, même si les messages sont là", () => {
    const { queryByText } = renderRn(<ConversationThread {...base} isResolving />);
    // Ni fil vide, ni composer : rien n'est encore décidé.
    expect(queryByText("messages.empty.title")).toBeNull();
  });

  it("propose de recommencer la RÉSOLUTION quand il n'y a pas encore de fil", () => {
    const onRetryResolve = vi.fn();
    const { container } = renderRn(
      <ConversationThread
        {...base}
        conversationId={undefined}
        hasResolveError
        onRetryResolve={onRetryResolve}
      />,
    );

    pressRetry(container);

    expect(onRetryResolve).toHaveBeenCalledOnce();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("propose de recharger les MESSAGES quand le fil existe", () => {
    const onRetryResolve = vi.fn();
    mockMessages({ isError: true });
    const { container } = renderRn(
      <ConversationThread {...base} onRetryResolve={onRetryResolve} />,
    );

    pressRetry(container);

    expect(refetch).toHaveBeenCalledOnce();
    expect(onRetryResolve).not.toHaveBeenCalled();
  });

  it("marque lu dès qu'un message entrant n'est pas lu", async () => {
    mockMessages({ data: [message({ senderId: "coach-1", readAt: null })] });
    renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce();
    });
  });

  it("ne marque pas lu ses PROPRES messages non lus", async () => {
    mockMessages({ data: [message({ id: "m-2", senderId: "me", readAt: null })] });
    renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(vi.mocked(useMessages)).toHaveBeenCalled();
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne marque pas lu sans fil, même avec des messages en cache", async () => {
    mockMessages({ data: [message({ readAt: null })] });
    renderRn(<ConversationThread {...base} conversationId={undefined} />);
    await waitFor(() => {
      expect(vi.mocked(useMessages)).toHaveBeenCalled();
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("fait passer le refus manuel devant l'erreur d'upload", async () => {
    vi.mocked(useSendMessageMedia).mockReturnValue({
      pickAndSend,
      recordAndSend: vi.fn(),
      isUploading: false,
      step: null,
      audioError: new MediaRejectedError("messages.media.audioTooBig"),
    } as unknown as ReturnType<typeof useSendMessageMedia>);
    // La galerie refuse AVANT l'envoi : c'est ce refus-là que l'athlète doit lire.
    pickAndSend.mockImplementation(async (report: (key: string) => void) => {
      report("messages.media.permission");
      return [];
    });

    const { container, findByText, queryByText } = renderRn(<ConversationThread {...base} />);
    pressAttach(container);

    expect(await findByText("messages.media.permission")).toBeTruthy();
    expect(queryByText("messages.media.audioTooBig")).toBeNull();
  });

  it("dit l'erreur d'upload quand rien ne la précède", () => {
    vi.mocked(useSendMessageMedia).mockReturnValue({
      pickAndSend,
      recordAndSend: vi.fn(),
      isUploading: false,
      step: null,
      audioError: new MediaRejectedError("messages.media.audioTooBig"),
    } as unknown as ReturnType<typeof useSendMessageMedia>);

    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("messages.media.audioTooBig")).not.toBeNull();
  });

  it("garde le message du serveur quand la panne est technique", () => {
    vi.mocked(useSendMessageMedia).mockReturnValue({
      pickAndSend,
      recordAndSend: vi.fn(),
      isUploading: false,
      step: null,
      audioError: new ApiError(500, "le serveur a refusé ce fichier", null),
    } as unknown as ReturnType<typeof useSendMessageMedia>);

    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("le serveur a refusé ce fichier")).not.toBeNull();
  });

  it("envoie le texte du composer comme un message TEXT", () => {
    const mutate = vi.fn();
    vi.mocked(useSendMessage).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    const { container } = renderRn(<ConversationThread {...base} />);

    const field = container.querySelector("textarea, input");
    if (field == null) throw new Error("champ de saisie introuvable");
    fireEvent.change(field, { target: { value: "bien joué" } });
    pressIcon(container, "send");

    expect(mutate).toHaveBeenCalledWith({ type: "TEXT", content: "bien joué" });
  });

  it("efface le refus précédent avant d'envoyer une note vocale", async () => {
    const recordAndSend = vi.fn();
    vi.mocked(useSendMessageMedia).mockReturnValue({
      pickAndSend,
      recordAndSend,
      isUploading: false,
      step: null,
      audioError: null,
    } as unknown as ReturnType<typeof useSendMessageMedia>);
    // La galerie a refusé : son message est à l'écran quand la note vocale part.
    pickAndSend.mockImplementation(async (report: (key: string) => void) => {
      report("messages.media.permission");
      return [];
    });

    const { container, findByText, queryByText } = renderRn(<ConversationThread {...base} />);
    pressAttach(container);
    expect(await findByText("messages.media.permission")).toBeTruthy();

    pressButton(container, "enregistrer");

    expect(recordAndSend).toHaveBeenCalledWith({ uri: "file:///note.m4a", durationSeconds: 3 });
    // Le refus de la galerie ne doit pas survivre au geste suivant.
    expect(queryByText("messages.media.permission")).toBeNull();
  });

  it("liste fichier par fichier ce qui n'a pas pu partir", async () => {
    pickAndSend.mockResolvedValue([
      { fileName: "lourde.mp4", reason: { key: "messages.media.videoTooBig", params: {} } },
      { fileName: null, reason: { message: "le serveur a refusé ce fichier" } },
    ]);
    const { container, findByText } = renderRn(<ConversationThread {...base} />);

    pressAttach(container);

    expect(await findByText(/lourde\.mp4/)).toBeTruthy();
    expect(await findByText(/le serveur a refusé ce fichier/)).toBeTruthy();
  });
});

/** Le bouton de `CmvErrorState`, dont le libellé est posé par le composant lui-même. */
function pressRetry(container: HTMLElement): void {
  pressButton(container, "common.retry");
}

function pressAttach(container: HTMLElement): void {
  pressIcon(container, "add-circle-outline");
}

/** Les boutons de la barre d'envoi n'ont que leur icône pour se distinguer. */
function pressIcon(container: HTMLElement, name: string): void {
  const button = container.querySelector(`[data-icon="${name}"]`)?.parentElement;
  if (button == null) throw new Error(`bouton « ${name} » introuvable`);
  press(button);
}

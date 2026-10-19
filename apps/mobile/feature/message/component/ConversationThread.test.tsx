import type { ConversationDto, MessageDto } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationThread } from "@/feature/message/component/ConversationThread";
import { useMarkRead, useMessages, useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";
import { CmvButton, type RecordedAudio } from "@/shared/component";
import { ApiError } from "@/shared/lib/api";
import { MediaRejectedError } from "@/shared/util/media.util";
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
const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: () => sessionMock() } }));

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
    createdAt: "2026-10-18T10:00:00.000Z",
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
  sessionMock.mockReturnValue({ data: { user: { id: "me" } } });
  mockMessages({});
  vi.mocked(useSendMessage).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
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

function conversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: "cv-1",
    kind: "DIRECT",
    participants: [
      { userId: "coach-1", name: "Chloé Caron", capability: "coach", lastReadAt: null },
    ],
    lastReadAt: null,
    lastMessageAt: null,
    lastMessageSenderId: null,
    lastMessageType: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: "2026-10-18T09:00:00.000Z",
    ...overrides,
  };
}

// « M, TI » vu par C (planche M3) : TI a lu jusqu'à 10:40, M jamais.
const group = (overrides: Partial<ConversationDto> = {}) =>
  conversation({
    kind: "GROUP",
    participants: [
      { userId: "m", name: "Marc Morel", capability: "coach", lastReadAt: null },
      {
        userId: "ti",
        name: "Tia Iris",
        capability: "athlete",
        lastReadAt: "2026-10-18T10:40:00.000Z",
      },
    ],
    ...overrides,
  });

const base = { conversation: conversation() };
const readTo = (lastReadAt: string) => ({ conversation: conversation({ lastReadAt }) });

describe("ConversationThread", () => {
  // Les hooks du fil tournent AVANT le retour du chargement : ils lisent alors une liste vide,
  // pas un `undefined` — et rien n'est marqué lu tant que rien n'est arrivé (#512).
  it("ne marque rien et ne dit pas le fil vide pendant le chargement", () => {
    mockMessages({ data: undefined, isPending: true });
    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("messages.empty.title")).toBeNull();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("propose de recharger les messages en échec", () => {
    mockMessages({ isError: true });
    const { container } = renderRn(<ConversationThread {...base} />);

    pressRetry(container);

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("marque lu dès qu'un message entrant n'est pas lu", async () => {
    mockMessages({ data: [message({ senderId: "coach-1" })] });
    renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce();
    });
  });

  // #305 : m1 marqué, m2 arrivé avant que le cache ne le sache. Le fil doit repartir pour m2.
  it("marque aussi un second entrant arrivé après le premier marquage", async () => {
    mockMessages({ data: [message({ id: "m-1" })], dataUpdatedAt: 1 });
    const { rerender } = renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce();
    });

    mockMessages({
      data: [message({ id: "m-1" }), message({ id: "m-2", createdAt: "2026-10-18T10:05:00.000Z" })],
      dataUpdatedAt: 2,
    });
    // La liste a relu ma marque, posée sur m-1 : m-2 est arrivé après.
    rerender(<ConversationThread {...readTo("2026-10-18T10:00:00.000Z")} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledTimes(2);
    });
  });

  it("ne remarque pas le même entrant à chaque sondage", async () => {
    mockMessages({ data: [message({ id: "m-1" })], dataUpdatedAt: 1 });
    const { rerender } = renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce();
    });

    mockMessages({ data: [message({ id: "m-1" })], dataUpdatedAt: 2 });
    rerender(<ConversationThread {...base} />);
    expect(markRead).toHaveBeenCalledOnce();
  });

  it("retente au sondage suivant un marquage en échec", async () => {
    markRead.mockImplementationOnce((_: unknown, options: { onError: () => void }) =>
      options.onError(),
    );
    mockMessages({ data: [message({ id: "m-1" })], dataUpdatedAt: 1 });
    const { rerender } = renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledOnce();
    });

    mockMessages({ data: [message({ id: "m-1" })], dataUpdatedAt: 2 });
    rerender(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledTimes(2);
    });
  });

  // #611 : ce qui précède ma marque de lecture est lu, quel que soit le message.
  it("ne marque rien quand ma marque couvre déjà le dernier entrant", async () => {
    mockMessages({ data: [message({ id: "m-1" })] });
    renderRn(<ConversationThread {...readTo("2026-10-18T10:00:00.000Z")} />);
    await waitFor(() => {
      expect(vi.mocked(useMessages)).toHaveBeenCalled();
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne marque rien tant que la session n'est pas connue", async () => {
    sessionMock.mockReturnValue({ data: null });
    mockMessages({ data: [message({})] });
    renderRn(<ConversationThread {...base} />);
    await waitFor(() => {
      expect(vi.mocked(useMessages)).toHaveBeenCalled();
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne marque pas lu ses PROPRES messages", async () => {
    mockMessages({ data: [message({ id: "m-2", senderId: "me" })] });
    renderRn(<ConversationThread {...base} />);
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

  it("garde le message de l'API quand elle refuse le fichier", () => {
    vi.mocked(useSendMessageMedia).mockReturnValue({
      pickAndSend,
      recordAndSend: vi.fn(),
      isUploading: false,
      step: null,
      audioError: new ApiError(409, "le serveur a refusé ce fichier", null),
    } as unknown as ReturnType<typeof useSendMessageMedia>);

    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("le serveur a refusé ce fichier")).not.toBeNull();
  });

  it("envoie le texte du composer comme un message TEXT", () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSendMessage).mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    const { container } = renderRn(<ConversationThread {...base} />);

    const field = container.querySelector("textarea, input");
    if (field == null) throw new Error("champ de saisie introuvable");
    fireEvent.change(field, { target: { value: "bien joué" } });
    pressIcon(container, "send");

    expect(mutateAsync).toHaveBeenCalledWith({ type: "TEXT", content: "bien joué" });
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
      {
        id: "0",
        fileName: "lourde.mp4",
        reason: { key: "messages.media.videoTooBig", params: {} },
      },
      { id: "1", fileName: null, reason: { message: "le serveur a refusé ce fichier" } },
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

describe("ConversationThread — autour du fil", () => {
  it("dit l'échec de l'envoi d'un texte", () => {
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useSendMessage>);
    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("messages.sendError")).not.toBeNull();
  });
});

describe("ConversationThread — en-tête (#612)", () => {
  // La capacité, pas la provenance : « via F » reste dans le sélecteur (tranché en #598).
  it("nomme l'autre et sa capacité dans un fil à deux", () => {
    const { queryByText } = renderRn(<ConversationThread {...base} />);

    expect(queryByText("Chloé Caron")).not.toBeNull();
    expect(queryByText("messages.capability.coach")).not.toBeNull();
  });

  it("liste les participants et les compte, moi compris, à plusieurs", () => {
    const { queryByText } = renderRn(<ConversationThread conversation={group()} />);

    expect(queryByText("Marc Morel, Tia Iris")).not.toBeNull();
    expect(queryByText("messages.participantCount")).not.toBeNull();
  });

  // Un fil dont l'autre compte a été effacé (MC-18) : on ne devine pas un nom.
  it("rend « — » quand plus personne n'y figure", () => {
    const { queryAllByText } = renderRn(
      <ConversationThread conversation={conversation({ participants: [] })} />,
    );

    expect(queryAllByText("—").length).toBeGreaterThan(0);
  });

  it("revient à la liste", () => {
    const { container } = renderRn(<ConversationThread {...base} />);

    pressIcon(container, "chevron-back");

    expect(router.back).toHaveBeenCalled();
  });

  it("invite au premier message d'une conversation vide", () => {
    const { queryByText } = renderRn(<ConversationThread conversation={group()} />);

    expect(queryByText("messages.empty.title")).not.toBeNull();
    expect(queryByText("messages.empty.description")).not.toBeNull();
  });
});

describe("ConversationThread — à plusieurs (#612)", () => {
  it("nomme l'auteur des bulles reçues, pas des miennes", () => {
    mockMessages({
      data: [
        message({ id: "m-1", senderId: "m", content: "de M" }),
        message({ id: "m-2", senderId: "me", content: "de moi" }),
      ],
    });
    const { queryAllByText } = renderRn(<ConversationThread conversation={group()} />);

    // Le titre porte « Marc Morel, Tia Iris » d'un tenant : le nom seul est celui de la bulle.
    expect(queryAllByText("Marc Morel")).toHaveLength(1);
    expect(queryAllByText("Tia Iris")).toHaveLength(0);
  });

  it("ne nomme personne dans un fil à deux", () => {
    mockMessages({ data: [message({ id: "m-1", senderId: "coach-1" })] });
    const { queryAllByText } = renderRn(<ConversationThread {...base} />);

    // « Chloé Caron » n'apparaît que dans l'en-tête.
    expect(queryAllByText("Chloé Caron")).toHaveLength(1);
  });

  // M3 : TI a lu mon dernier message, M non.
  it("dit qui a lu mon dernier message", () => {
    mockMessages({
      data: [message({ id: "m-1", senderId: "me", createdAt: "2026-10-18T10:40:00.000Z" })],
    });
    const { queryByText } = renderRn(<ConversationThread conversation={group()} />);

    expect(queryByText("messages.readBy")).not.toBeNull();
  });

  it("ne dit rien tant que personne ne l'a lu", () => {
    mockMessages({
      data: [message({ id: "m-1", senderId: "me", createdAt: "2026-10-18T11:00:00.000Z" })],
    });
    const { queryByText } = renderRn(<ConversationThread conversation={group()} />);

    expect(queryByText("messages.readBy")).toBeNull();
  });
});

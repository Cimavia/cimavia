import type { ConversationDto, MessageDto } from "@cmv/shared";
import { act, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { useMarkRead, useSendMessage, useThreadMessages } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { renderWithProviders } from "../../../../test/render";
import { MessageThread } from "./MessageThread";

/**
 * Les hooks du fil sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI est
 * QUAND le fil marque lu — à chaque nouvel entrant, une seule fois chacun, et de nouveau après un
 * échec (#305). La barre d'envoi et les bulles ont leurs propres tests.
 */
vi.mock("@/feature/message/hook/useMessages", () => ({
  useThreadMessages: vi.fn(),
  useSendMessage: vi.fn(),
  useMarkRead: vi.fn(),
}));
vi.mock("@/feature/message/hook/useSendMessageMedia", () => ({ useSendMessageMedia: vi.fn() }));
vi.mock("@/feature/message/component/Composer", () => ({ Composer: vi.fn(() => null) }));
vi.mock("@/feature/message/component/MessageBubble", () => ({ MessageBubble: vi.fn(() => null) }));
vi.mock("@/shared/hook/useCapabilities", () => ({ useExercisedCapability: () => "coach" }));
vi.mock("@/shared/hook/useFreshMediaUrl", () => ({ useFreshMediaUrl: () => vi.fn() }));

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: () => sessionMock() } }));

const READ_AT = "2026-09-27T10:00:00.000Z";
const markRead = vi.fn();

function message(id: string, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    senderId: "athlete-1",
    type: "TEXT",
    content: "salut",
    createdAt: READ_AT,
    ...overrides,
  } as MessageDto;
}

/** Un état du fil, comme un sondage le rend : `dataUpdatedAt` date chaque réponse. */
function mockThread(data: MessageDto[], dataUpdatedAt = 1): void {
  vi.mocked(useThreadMessages).mockReturnValue({
    data,
    dataUpdatedAt,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useThreadMessages>);
}

function conversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: "cv-1",
    kind: "DIRECT",
    participants: [{ userId: "athlete-1", name: "Léa", capability: "athlete", lastReadAt: null }],
    lastReadAt: null,
    lastMessageAt: null,
    lastMessageSenderId: null,
    lastMessageType: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: READ_AT,
    ...overrides,
  };
}

// « M, TI » vu par C (planche M3).
const group = (overrides: Partial<ConversationDto> = {}) =>
  conversation({
    kind: "GROUP",
    participants: [
      { userId: "m", name: "M", capability: "coach", lastReadAt: null },
      { userId: "ti", name: "TI", capability: "athlete", lastReadAt: "2026-09-27T10:40:00.000Z" },
    ],
    ...overrides,
  });

const props = { conversation: conversation() };
const readTo = (lastReadAt: string) => ({ conversation: conversation({ lastReadAt }) });

beforeAll(() => {
  // jsdom ne défile pas : le fil colle au dernier message à chaque arrivée.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockReturnValue({ data: { user: { id: "me" } } });
  mockThread([]);
  vi.mocked(useSendMessage).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as unknown as ReturnType<typeof useSendMessage>);
  vi.mocked(useMarkRead).mockReturnValue({ mutate: markRead } as unknown as ReturnType<
    typeof useMarkRead
  >);
  vi.mocked(useSendMessageMedia).mockReturnValue({
    sendFiles: vi.fn(),
    sendAudio: vi.fn(),
    isUploading: false,
    progress: 0,
    retry: null,
    step: null,
  } as unknown as ReturnType<typeof useSendMessageMedia>);
});

describe("MessageThread — marquage lu", () => {
  it("marque lu dès qu'un message entrant n'est pas lu", async () => {
    mockThread([message("m1")]);
    renderWithProviders(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledOnce());
  });

  // #305 : m1 marqué, m2 arrivé avant que le cache ne le sache. Le fil doit repartir pour m2.
  it("marque aussi un second entrant arrivé après le premier marquage", async () => {
    mockThread([message("m1")], 1);
    const { rerender } = renderWithProviders(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledOnce());

    // La liste a relu ma marque (m1), m2 est arrivé après.
    mockThread([message("m1"), message("m2", { createdAt: "2026-09-27T10:05:00.000Z" })], 2);
    rerender(<MessageThread {...readTo(READ_AT)} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
  });

  // #611 : ce qui précède ma marque de lecture est lu, quel que soit le message.
  it("ne marque rien quand ma marque couvre déjà le dernier entrant", () => {
    mockThread([message("m1")]);
    renderWithProviders(<MessageThread {...readTo(READ_AT)} />);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne remarque pas le même entrant à chaque sondage", async () => {
    mockThread([message("m1")], 1);
    const { rerender } = renderWithProviders(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledOnce());

    mockThread([message("m1")], 2);
    rerender(<MessageThread {...props} />);
    expect(markRead).toHaveBeenCalledOnce();
  });

  it("retente au sondage suivant un marquage en échec", async () => {
    markRead.mockImplementationOnce((_: unknown, options: { onError: () => void }) =>
      options.onError(),
    );
    mockThread([message("m1")], 1);
    const { rerender } = renderWithProviders(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledOnce());

    mockThread([message("m1")], 2);
    rerender(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
  });

  it("ne marque pas lu ses PROPRES messages non lus", () => {
    mockThread([message("m1", { senderId: "me" })]);
    renderWithProviders(<MessageThread {...props} />);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne marque rien tant que la session n'est pas connue", () => {
    sessionMock.mockReturnValue({ data: null });
    mockThread([message("m1")]);
    renderWithProviders(<MessageThread {...props} />);
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("MessageThread — notes vocales enchaînées (#529)", () => {
  const voice = (id: string) =>
    message(id, { type: "AUDIO", content: null, media: {} as MessageDto["media"] });

  /** Ce que la dernière bulle rendue pour `id` a reçu pour s'enchaîner aux autres. */
  function cueOf(id: string) {
    const calls = vi
      .mocked(MessageBubble)
      .mock.calls.filter(([bubble]) => bubble.message.id === id);
    return calls.at(-1)?.[0].voiceNoteCue;
  }

  it("demande la note suivante du fil à la fin d'une note", async () => {
    mockThread([voice("m1"), voice("m2")]);
    renderWithProviders(<MessageThread {...props} />);
    expect(cueOf("m2")?.cued).toBe(false);

    act(() => cueOf("m1")?.onFinish());

    await waitFor(() => expect(cueOf("m2")?.cued).toBe(true));
  });
});

describe("MessageThread — barre d'envoi", () => {
  const composerProps = () => vi.mocked(Composer).mock.lastCall?.[0];

  it("ouvre la barre, et la ferme le temps d'un envoi", () => {
    renderWithProviders(<MessageThread {...props} />);
    expect(composerProps()).toMatchObject({ sending: false, mediaBusy: false });

    vi.mocked(useSendMessage).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof useSendMessage>);
    renderWithProviders(<MessageThread {...props} />);
    expect(composerProps()).toMatchObject({ sending: true });
  });
});

describe("MessageThread — en-tête (#612)", () => {
  // La capacité, pas la provenance : « via F » reste dans le sélecteur (tranché en #598).
  it("nomme l'autre et sa capacité dans un fil à deux", () => {
    const view = renderWithProviders(<MessageThread {...props} />);

    expect(view.getByRole("heading", { name: "Léa" })).toBeInTheDocument();
    expect(view.getByText("messages.capability.athlete")).toBeInTheDocument();
  });

  it("liste les participants et les compte, moi compris, à plusieurs", () => {
    const view = renderWithProviders(<MessageThread conversation={group()} />);

    expect(view.getByRole("heading", { name: "M, TI" })).toBeInTheDocument();
    expect(view.getByText("messages.participantCount")).toBeInTheDocument();
  });

  // Un fil dont l'autre compte a été effacé (MC-18) : on ne devine pas un nom.
  it("rend « — » quand plus personne n'y figure", () => {
    const view = renderWithProviders(
      <MessageThread conversation={conversation({ participants: [] })} />,
    );

    expect(view.getByRole("heading", { name: "—" })).toBeInTheDocument();
  });

  it("invite au premier message d'une conversation vide", () => {
    const view = renderWithProviders(<MessageThread conversation={group()} />);

    expect(view.getByText("messages.empty.title")).toBeInTheDocument();
    expect(view.getByText("messages.empty.description")).toBeInTheDocument();
  });
});

describe("MessageThread — à plusieurs (#612)", () => {
  const bubbleOf = (id: string) =>
    vi
      .mocked(MessageBubble)
      .mock.calls.filter(([bubble]) => bubble.message.id === id)
      .at(-1)?.[0];

  it("nomme l'auteur des bulles reçues, pas des miennes", () => {
    mockThread([message("m1", { senderId: "m" }), message("m2", { senderId: "me" })]);
    renderWithProviders(<MessageThread conversation={group()} />);

    expect(bubbleOf("m1")?.author).toEqual({ name: "M" });
    expect(bubbleOf("m2")?.author).toBeNull();
  });

  it("ne nomme personne dans un fil à deux", () => {
    mockThread([message("m1")]);
    renderWithProviders(<MessageThread {...props} />);

    expect(bubbleOf("m1")?.author).toBeNull();
  });

  // M3 : TI a lu mon dernier message, M non.
  it("dit qui a lu mon dernier message", () => {
    mockThread([message("m1", { senderId: "me", createdAt: "2026-09-27T10:40:00.000Z" })]);
    const view = renderWithProviders(<MessageThread conversation={group()} />);

    expect(view.getByText("messages.readBy")).toBeInTheDocument();
  });

  it("ne dit rien tant que personne ne l'a lu", () => {
    mockThread([message("m1", { senderId: "me", createdAt: "2026-09-27T11:00:00.000Z" })]);
    const view = renderWithProviders(<MessageThread conversation={group()} />);

    expect(view.queryByText("messages.readBy")).toBeNull();
  });
});

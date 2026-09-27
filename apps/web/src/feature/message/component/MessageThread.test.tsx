import type { MessageDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/feature/message/component/Composer", () => ({ Composer: () => null }));
vi.mock("@/feature/message/component/MessageBubble", () => ({ MessageBubble: () => null }));
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
    readAt: null,
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

const props = {
  conversationId: "cv-1",
  counterpartName: "Léa",
  hasResolveError: false,
  onRetry: vi.fn(),
};

beforeAll(() => {
  // jsdom ne défile pas : le fil colle au dernier message à chaque arrivée.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockReturnValue({ data: { user: { id: "me" } } });
  mockThread([]);
  vi.mocked(useSendMessage).mockReturnValue({
    mutate: vi.fn(),
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

    mockThread([message("m1", { readAt: READ_AT }), message("m2")], 2);
    rerender(<MessageThread {...props} />);
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
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

  it("ne marque pas lu sans fil, même avec des messages en cache", () => {
    mockThread([message("m1")]);
    renderWithProviders(<MessageThread {...props} conversationId={undefined} />);
    expect(markRead).not.toHaveBeenCalled();
  });
});

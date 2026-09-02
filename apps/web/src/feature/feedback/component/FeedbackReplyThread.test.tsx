import type { MessageDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { FeedbackReplyThread } from "@/feature/feedback/component/FeedbackReplyThread";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({ useFeedbackReply: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach-1" } } }) },
}));

const FEEDBACK = { id: "f-1", athleteId: "a-1" };

function message(overrides: Partial<MessageDto>): MessageDto {
  return {
    id: "m-1",
    conversationId: "c-1",
    senderId: "coach-1",
    type: "TEXT",
    content: "Bien joué, on garde cette voie",
    media: null,
    scheduledSessionId: null,
    sessionFeedbackId: "f-1",
    attachment: null,
    readAt: null,
    createdAt: "2026-10-16T19:42:00.000Z",
    ...overrides,
  } as MessageDto;
}

function mockReply(overrides: Record<string, unknown> = {}) {
  vi.mocked(useFeedbackReply).mockReturnValue({
    ready: true,
    hasThreadError: false,
    sendText: vi.fn(),
    sending: false,
    sendFiles: vi.fn(),
    sendAudio: vi.fn(),
    mediaBusy: false,
    progress: 0,
    step: null,
    ...overrides,
  } as ReturnType<typeof useFeedbackReply>);
}

describe("FeedbackReplyThread", () => {
  it("rend les réponses déjà envoyées", () => {
    mockReply();
    const { queryByText } = renderWithProviders(
      <FeedbackReplyThread feedback={FEEDBACK} messages={[message({})]} />,
    );

    expect(queryByText("Bien joué, on garde cette voie")).not.toBeNull();
  });

  /**
   * Un débrief sans réponse ne rend PAS de bloc vide : une section « Réponses (0) » laisserait
   * croire qu'on attend quelque chose. Le composer, lui, reste — c'est ce qui permet d'en écrire
   * une première.
   */
  it("n'affiche aucune bulle sans réponse, mais garde de quoi écrire", () => {
    mockReply();
    const { queryByText, queryByPlaceholderText } = renderWithProviders(
      <FeedbackReplyThread feedback={FEEDBACK} messages={[]} />,
    );

    expect(queryByText("Bien joué, on garde cette voie")).toBeNull();
    expect(queryByPlaceholderText("messages.placeholder")).not.toBeNull();
  });

  // L'échec de RÉSOLUTION du fil ne vient pas de ce qu'on a écrit : le masquer laisserait croire
  // qu'on n'a pas le droit de répondre à cet athlète.
  it("dit qu'il n'a pas pu ouvrir la conversation", () => {
    mockReply({ ready: false, hasThreadError: true });
    const { queryByText } = renderWithProviders(
      <FeedbackReplyThread feedback={FEEDBACK} messages={[]} />,
    );

    expect(queryByText("feedback.reply.threadError")).not.toBeNull();
  });
});

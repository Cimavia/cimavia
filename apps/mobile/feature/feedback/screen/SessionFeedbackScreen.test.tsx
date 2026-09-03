import type { MessageDto, SessionFeedbackDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { SessionFeedbackScreen } from "@/feature/feedback/screen/SessionFeedbackScreen";
import { renderRn } from "@/test/render";

/**
 * Les DEUX sections d'écriture sont remplacées : elles ont leurs propres tests, et ce qui
 * s'éprouve ici est ce que l'écran DISPOSE — quand le décompte accompagne le texte, et ce qu'il
 * donne à la barre de réponse.
 */
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "s-1" }) }));
vi.mock("@/feature/feedback/component/FeedbackTextSection", () => ({
  FeedbackTextSection: () => null,
}));
vi.mock("@/feature/feedback/component/FeedbackMediaSection", () => ({
  FeedbackMediaSection: () => null,
}));
vi.mock("@/feature/feedback/component/FeedbackTrackingSection", () => ({
  FeedbackTrackingSection: () => null,
}));
vi.mock("@/feature/feedback/hook/useSessionFeedback", () => ({ useSessionFeedback: vi.fn() }));
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({ useFeedbackReply: vi.fn() }));
vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: () => ({ data: null }) }));
vi.mock("@/feature/coach", () => ({ useMyCoach: () => ({ data: { coachId: "coach-1" } }) }));
vi.mock("@/feature/message/hook/useConversation", () => ({
  useMyConversation: () => ({ data: { id: "c-1" }, isError: false }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "athlete-1" } } }) },
}));

function detail(overrides: Partial<SessionFeedbackDto> = {}): SessionFeedbackDto {
  return {
    id: "f-1",
    scheduledSessionId: "s-1",
    content: "Bien tenu",
    media: [],
    trackedExercises: [],
    messages: [],
    ...overrides,
  } as SessionFeedbackDto;
}

const COACH_REPLY = {
  id: "m-1",
  senderId: "coach-1",
  type: "TEXT",
  content: "Bien joué, on garde cette voie",
  media: null,
  attachment: null,
  readAt: null,
  createdAt: "2026-10-16T19:42:00.000Z",
} as MessageDto;

function mockFeedback(state: Record<string, unknown>): void {
  vi.mocked(useSessionFeedback).mockReturnValue({
    data: detail(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useSessionFeedback>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFeedback({});
  vi.mocked(useFeedbackReply).mockReturnValue({
    ready: true,
    hasThreadError: false,
    sendText: vi.fn(),
    sending: false,
    pickAndSend: vi.fn().mockResolvedValue([]),
    recordAndSend: vi.fn(),
    mediaBusy: false,
    step: null,
    audioError: null,
  } as unknown as ReturnType<typeof useFeedbackReply>);
});

describe("SessionFeedbackScreen", () => {
  it("montre la réponse du coach sous le formulaire", () => {
    mockFeedback({ data: detail({ messages: [COACH_REPLY] }) });
    const { queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("Bien joué, on garde cette voie")).not.toBeNull();
  });

  /**
   * Rien tant que le débrief n'existe pas : on ne répond pas à ce qu'on n'a pas encore écrit, et
   * une barre d'envoi posée là n'aurait aucun débrief à citer.
   */
  it("ne propose pas de répondre avant que le débrief existe", () => {
    mockFeedback({ data: null });
    const { queryByPlaceholderText, queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("feedback.reply.title")).toBeNull();
    expect(queryByPlaceholderText("messages.placeholder")).toBeNull();
  });

  it("propose de répondre dès que le débrief existe", () => {
    const { queryByPlaceholderText } = renderRn(<SessionFeedbackScreen />);
    expect(queryByPlaceholderText("messages.placeholder")).not.toBeNull();
  });

  it("montre l'erreur de chargement plutôt que le formulaire", () => {
    mockFeedback({ data: undefined, isError: true });
    const { queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("feedback.title")).toBeNull();
  });
});

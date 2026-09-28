import type { MessageDto, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { SessionFeedbackScreen } from "@/feature/feedback/screen/SessionFeedbackScreen";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { renderRn } from "@/test/render";
import { storedItems } from "../../../test/setup";

/**
 * Les sections d'écriture sont remplacées par des ESPIONS : elles ont leurs propres tests, et ce
 * qui s'éprouve ici est ce que l'écran leur DONNE — le décompte qui accompagne le texte, le
 * nettoyage du suivi local une fois le débrief parti, et ce qu'il passe à la barre de réponse.
 *
 * Le suivi local, lui, est le VRAI (`useLocalTracking`, sur l'AsyncStorage du harnais) : c'est son
 * câblage à l'enregistrement que ce fichier doit pouvoir casser (#378).
 */
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "s-1" }) }));
vi.mock("@/feature/feedback/component/FeedbackTextSection", () => ({
  FeedbackTextSection: vi.fn(() => null),
}));
vi.mock("@/feature/feedback/component/FeedbackMediaSection", () => ({
  FeedbackMediaSection: () => null,
}));
vi.mock("@/feature/feedback/component/FeedbackTrackingSection", () => ({
  FeedbackTrackingSection: vi.fn(() => null),
}));
vi.mock("@/feature/feedback/hook/useSessionFeedback", () => ({ useSessionFeedback: vi.fn() }));
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({ useFeedbackReply: vi.fn() }));
vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: vi.fn() }));
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

const TRACKING_KEY = "cimavia-tracking:s-1";

// Une séance à un exercice, déjà suivi côté serveur : une série cochée sur deux.
const SESSION = {
  id: "s-1",
  exercises: [{ id: "sx-1", title: "Traction", tracking: { "b-1": { checked: [0] } } }],
} as unknown as ScheduledSessionDto;

function mockSession(data: ScheduledSessionDto | null): void {
  vi.mocked(useScheduledSession).mockReturnValue({ data } as unknown as ReturnType<
    typeof useScheduledSession
  >);
}

// Ce que l'écran a donné, au dernier rendu, à la section qui enregistre le texte.
function textSectionProps() {
  const props = vi.mocked(FeedbackTextSection).mock.lastCall?.[0];
  if (props == null) throw new Error("FeedbackTextSection jamais rendue");
  return props;
}

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
  mockSession(null);
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

describe("SessionFeedbackScreen — le décompte accompagne le texte", () => {
  it("sans séance chargée, le texte part SEUL : aucun décompte, plutôt qu'un objet vide", () => {
    renderRn(<SessionFeedbackScreen />);

    expect(FeedbackTrackingSection).not.toHaveBeenCalled();
    expect(textSectionProps()).not.toHaveProperty("tracking");
  });

  it("avec la séance, le décompte est rendu et part avec le texte", () => {
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);

    expect(vi.mocked(FeedbackTrackingSection).mock.lastCall?.[0]).toMatchObject({
      exercises: SESSION.exercises,
      tracking: { "sx-1": { "b-1": { checked: [0] } } },
    });
    // Rien en local : le suivi envoyé EST celui du serveur, et rien n'est à renvoyer.
    expect(textSectionProps()).toMatchObject({
      tracking: { "sx-1": { "b-1": { checked: [0] } } },
      trackingDirty: false,
    });
  });

  /**
   * Une coche prise pendant la séance sur un exercice que le coach a retiré depuis : le serveur
   * refuserait TOUT le débrief (#311). Elle reste sur l'appareil, mais ne part pas.
   */
  it("n'envoie pas la coche d'un exercice que le coach a retiré depuis (#490)", async () => {
    storedItems.set(
      TRACKING_KEY,
      JSON.stringify({
        "sx-1": { "b-1": { checked: [0, 1] } },
        "sx-retire": { "b-1": { checked: [0] } },
      }),
    );
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);

    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    expect(textSectionProps().tracking).toEqual({ "sx-1": { "b-1": { checked: [0, 1] } } });
  });

  it("une fois le débrief enregistré, le suivi local est effacé du disque", async () => {
    storedItems.set(TRACKING_KEY, JSON.stringify({ "sx-1": { "b-1": { checked: [0, 1] } } }));
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));

    act(() => textSectionProps().onSaved?.());

    // Le local a fait son travail : le garder ferait diverger les deux copies au prochain
    // chargement. L'écran redevient le miroir du serveur.
    expect(storedItems.has(TRACKING_KEY)).toBe(false);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(false));
  });
});

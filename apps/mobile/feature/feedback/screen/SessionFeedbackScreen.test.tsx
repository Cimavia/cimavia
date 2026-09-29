import type { MessageDto, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { FeedbackTrackingSection } from "@/feature/feedback/component/FeedbackTrackingSection";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { SessionFeedbackScreen } from "@/feature/feedback/screen/SessionFeedbackScreen";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
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

    act(() => textSectionProps().onSaved?.(textSectionProps().tracking));

    // Le local a fait son travail : le garder ferait diverger les deux copies au prochain
    // chargement. L'écran redevient le miroir du serveur.
    expect(storedItems.has(TRACKING_KEY)).toBe(false);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(false));
  });
  // Les cases restent actives pendant l'envoi : ce qui est coché entre-temps n'est pas parti (#499).
  it("une coche posée pendant l'envoi reste en local, à envoyer", async () => {
    storedItems.set(TRACKING_KEY, JSON.stringify({ "sx-1": { "b-1": { checked: [0, 1] } } }));
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    const sent = textSectionProps().tracking;

    const props = vi.mocked(FeedbackTrackingSection).mock.lastCall?.[0];
    act(() => props?.onToggleUnit("sx-1", "b-1", 2));
    act(() => textSectionProps().onSaved?.(sent));

    expect(JSON.parse(storedItems.get(TRACKING_KEY) ?? "null")).toEqual({
      "sx-1": { "b-1": { checked: [0, 1, 2] } },
    });
    expect(textSectionProps().trackingDirty).toBe(true);
  });
});

/**
 * L'écran de séance reste monté SOUS le débrief, sur la même pile (#346). Il est figuré ici par
 * sa lecture du suivi : le même hook, sur la même séance, avec le même distant.
 */
describe("SessionFeedbackScreen — l'écran de séance resté dessous", () => {
  const REMOTE = { "sx-1": { "b-1": { checked: [0] } } };

  async function sessionUnderneath() {
    const { result } = renderHook(() => useLocalTracking("s-1", REMOTE));
    // 3/4 cochés sur la séance, avant d'ouvrir le débrief.
    act(() => {
      result.current.toggleUnit("sx-1", "b-1", 1);
      result.current.toggleUnit("sx-1", "b-1", 2);
    });
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    return result;
  }

  // Le débrief corrige à 4/4 : sa section de décompte coche la dernière série.
  function correctInFeedback() {
    const props = vi.mocked(FeedbackTrackingSection).mock.lastCall?.[0];
    act(() => props?.onToggleUnit("sx-1", "b-1", 3));
  }

  it("de retour sur la séance, la correction du débrief s'y voit", async () => {
    const session = await sessionUnderneath();

    correctInFeedback();

    expect(session.current.tracking).toEqual({ "sx-1": { "b-1": { checked: [0, 1, 2, 3] } } });
  });

  it("une coche sur la séance part de la correction, pas de l'ancien décompte", async () => {
    const session = await sessionUnderneath();
    correctInFeedback();

    act(() => session.current.toggleUnit("sx-2", "b-1", 0));

    expect(JSON.parse(storedItems.get(TRACKING_KEY) ?? "null")).toEqual({
      "sx-1": { "b-1": { checked: [0, 1, 2, 3] } },
      "sx-2": { "b-1": { checked: [0] } },
    });
  });

  it("une fois le débrief enregistré, la séance redevient le miroir du serveur", async () => {
    const session = await sessionUnderneath();
    correctInFeedback();

    act(() => textSectionProps().onSaved?.(textSectionProps().tracking));
    expect(session.current.tracking).toBe(REMOTE);

    // La coche suivante part du serveur : l'ancien 3/4 local ne ressuscite pas.
    act(() => session.current.toggleUnit("sx-1", "b-1", 1));
    expect(JSON.parse(storedItems.get(TRACKING_KEY) ?? "null")).toEqual({
      "sx-1": { "b-1": { checked: [0, 1] } },
    });
  });
});

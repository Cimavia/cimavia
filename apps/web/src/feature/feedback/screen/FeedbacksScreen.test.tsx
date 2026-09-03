import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useFeedbacks,
  useMarkFeedbackRead,
  useSessionFeedback,
} from "@/feature/feedback/hook/useFeedbacks";
import { FeedbacksScreen } from "@/feature/feedback/screen/FeedbacksScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que la boîte de réception DÉCIDE — quel état elle montre, ce qu'elle ouvre, et quand elle
 * marque lu.
 */
vi.mock("@/feature/feedback/hook/useFeedbacks", () => ({
  useFeedbacks: vi.fn(),
  useMarkFeedbackRead: vi.fn(),
  useSessionFeedback: vi.fn(),
}));
vi.mock("@/feature/message/hook/useMessages", () => ({
  useConversationWith: () => ({ data: { id: "c-1" }, isError: false }),
}));
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({
  useFeedbackReply: () => ({
    ready: true,
    hasThreadError: false,
    sendText: vi.fn(),
    sending: false,
    sendFiles: vi.fn(),
    sendAudio: vi.fn(),
    mediaBusy: false,
    progress: 0,
    step: null,
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "coach-1", name: "Cédric" } } }),
    signOut: vi.fn(),
  },
}));
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthleteSheet: () => ({ data: null, isPending: false }),
  useSaveAthleteSheet: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));

const markRead = vi.fn();

function summary(overrides: Partial<CoachFeedbackSummaryDto>): CoachFeedbackSummaryDto {
  return {
    id: "f-1",
    scheduledSessionId: "s-1",
    planId: "p-1",
    athleteId: "a-1",
    athleteName: "Léa Moreau",
    sessionTitle: "Voie & projet 7b",
    scheduledDate: "2026-10-16",
    content: "Bien tenu sur les deux premières voies",
    mediaCount: 0,
    coachReadAt: null,
    repliedAt: null,
    createdAt: "2026-10-16T19:42:00.000Z",
    updatedAt: "2026-10-16T19:42:00.000Z",
    ...overrides,
  } as CoachFeedbackSummaryDto;
}

const UNREAD = summary({});
const READ = summary({
  id: "f-2",
  scheduledSessionId: "s-2",
  athleteId: "a-2",
  athleteName: "Thomas Rey",
  coachReadAt: "2026-10-16T20:00:00.000Z",
});

function mockList(state: Record<string, unknown>): void {
  vi.mocked(useFeedbacks).mockReturnValue({
    data: [UNREAD, READ],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useFeedbacks>);
}

function open(feedbackId?: string) {
  return renderInRoute(<FeedbacksScreen />, {
    path: "/feedbacks",
    links: ["/", "/messages", "/library", "/plans", "/invoices", "/reminders", "/account"],
    ...(feedbackId == null ? {} : { search: { feedback: feedbackId } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList({});
  vi.mocked(useMarkFeedbackRead).mockReturnValue({ mutate: markRead } as unknown as ReturnType<
    typeof useMarkFeedbackRead
  >);
  vi.mocked(useSessionFeedback).mockReturnValue({
    data: { media: [], trackedExercises: [], messages: [] } as unknown as SessionFeedbackDto,
    isPending: false,
  } as unknown as ReturnType<typeof useSessionFeedback>);
});

describe("FeedbacksScreen", () => {
  it("liste les débriefs reçus", async () => {
    const { queryByText } = await open();

    expect(queryByText("Léa Moreau")).not.toBeNull();
    expect(queryByText("Thomas Rey")).not.toBeNull();
  });

  /**
   * Trois états distincts, jamais confondus : « aucun débrief » sur une panne réseau serait un
   * mensonge, et la boîte ne se monte pas du tout tant qu'il n'y a rien à trier.
   */
  it("dit la panne plutôt que le vide", async () => {
    mockList({ data: undefined, isError: true });
    const { queryByText } = await open();

    expect(queryByText("common.errorTitle")).not.toBeNull();
    expect(queryByText("feedback.empty.title")).toBeNull();
  });

  it("dit le vide quand aucun débrief n'est arrivé", async () => {
    mockList({ data: [] });
    const { queryByText } = await open();

    expect(queryByText("feedback.empty.title")).not.toBeNull();
  });

  // Tant qu'aucun débrief n'est ouvert, le volet invite à en choisir un — il ne montre pas un
  // débrief au hasard.
  it("n'ouvre aucun débrief sans instruction", async () => {
    const { queryByText } = await open();

    expect(queryByText("feedback.inbox.pick")).not.toBeNull();
    expect(markRead).not.toHaveBeenCalled();
  });

  /**
   * L'ouverture peut venir d'un clic OU de l'url (tableau de suivi, puce « à propos de… ») : le
   * marquage vit donc dans un effet, seul chemin commun aux deux.
   */
  it("ouvre le débrief porté par l'url et le marque lu", async () => {
    const { queryByText } = await open("f-1");

    expect(queryByText("feedback.inbox.pick")).toBeNull();
    expect(markRead).toHaveBeenCalledWith("f-1");
  });

  it("ne remarque pas lu un débrief déjà lu", async () => {
    const { queryByText } = await open("f-2");

    expect(queryByText("feedback.inbox.pick")).toBeNull();
    expect(markRead).not.toHaveBeenCalled();
  });

  // La fiche s'ouvre PAR-DESSUS la boîte : envoyer le coach au tableau de bord lui ferait perdre
  // son tri en cours — sa recherche, son segment, le débrief ouvert.
  it("ouvre la fiche de l'athlète sans quitter la boîte", async () => {
    const { getByText, queryByText } = await open("f-1");

    fireEvent.click(getByText("feedback.detail.openSheet"));

    // La fiche s'affirme sur SA description, et non sur le nom : celui-ci est déjà dans la ligne
    // de la liste, qui reste visible derrière — c'est précisément ce qu'on vérifie.
    expect(queryByText("athlete.sheet.description")).not.toBeNull();
    expect(queryByText("feedback.inbox.pick")).toBeNull();
  });

  /**
   * Le branchement média du volet est EXHAUSTIF, et pas « audio d'un côté, tout le reste en
   * image » : c'est ce genre de raccourci qui rendait une vidéo par une balise image (#151).
   */
  it("rend chaque type de média du débrief avec son lecteur", async () => {
    vi.mocked(useSessionFeedback).mockReturnValue({
      data: {
        media: [
          { id: "md-1", type: "IMAGE", url: "https://x/1", fileName: "voie.jpg" },
          { id: "md-2", type: "AUDIO", url: "https://x/2", fileName: "note.m4a" },
          { id: "md-3", type: "VIDEO", url: "https://x/3", fileName: "essai.mp4" },
        ],
        trackedExercises: [],
        messages: [],
      } as unknown as SessionFeedbackDto,
      isPending: false,
    } as unknown as ReturnType<typeof useSessionFeedback>);

    const { container } = await open("f-1");

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("audio")).not.toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });
});

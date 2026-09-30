import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { coachFeedbackKeys } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
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
const { conversationWith, freshMediaUrl, reply } = vi.hoisted(() => ({
  reply: { onSent: (): unknown => undefined },
  conversationWith: vi.fn((_athleteId: string | null) => ({ data: { id: "c-1" }, isError: false })),
  freshMediaUrl: vi.fn(async (_mediaId: string) => null),
}));
vi.mock("@/feature/message/hook/useMessages", () => ({ useConversationWith: conversationWith }));
// La re-signature a ses propres tests : ici, on vérifie QUEL média le volet fait re-signer.
vi.mock("@/shared/hook/useFreshMediaUrl", () => ({ useFreshMediaUrl: () => freshMediaUrl }));
// `onSent` est retenu : c'est par lui que le volet dit à la boîte qu'une réponse est partie.
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({
  useFeedbackReply: (options: { onSent: () => unknown }) => {
    reply.onSent = options.onSent;
    return {
      ready: true,
      hasThreadError: false,
      sendText: vi.fn(),
      sending: false,
      sendFiles: vi.fn(),
      sendAudio: vi.fn(),
      mediaBusy: false,
      progress: 0,
      step: null,
    };
  },
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

  it("fait re-signer le média dont la lecture échoue, et lui seul", async () => {
    vi.mocked(useSessionFeedback).mockReturnValue({
      data: {
        media: [
          { id: "md-2", type: "AUDIO", url: "https://x/2", fileName: "note.m4a" },
          { id: "md-3", type: "VIDEO", url: "https://x/3", fileName: "essai.mp4" },
        ],
        trackedExercises: [],
        messages: [],
      } as unknown as SessionFeedbackDto,
      isPending: false,
    } as unknown as ReturnType<typeof useSessionFeedback>);
    const { container } = await open("f-1");

    fireEvent.error(container.querySelector("audio") as HTMLAudioElement);
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    await waitFor(() => expect(freshMediaUrl.mock.calls).toEqual([["md-2"], ["md-3"]]));
  });

  it("dit qu'il charge le détail du débrief", async () => {
    vi.mocked(useSessionFeedback).mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useSessionFeedback>);

    const { getByText } = await open("f-1");

    expect(getByText("common.loading")).toBeInTheDocument();
  });

  // Un débrief peut n'être que des médias : pas de texte inventé.
  it("rend « — » pour un débrief sans texte", async () => {
    mockList({ data: [summary({ content: null }), READ] });

    const { getAllByText } = await open("f-1");

    // La ligne de la liste ET le volet ouvert.
    expect(getAllByText("—")).toHaveLength(2);
  });

  /**
   * Son PROPRE débrief (auto-coaching) n'a pas de fil : le demander prendrait un 409 (#198),
   * affiché comme une panne passagère qui n'en est pas une.
   */
  it("ne résout aucun fil sur son propre débrief", async () => {
    mockList({ data: [summary({ athleteId: "coach-1", athleteName: "Cédric" })] });

    await open("f-1");

    expect(conversationWith).toHaveBeenCalledWith(null);
    expect(conversationWith).not.toHaveBeenCalledWith("coach-1");
  });

  it("dit qu'il charge la liste", async () => {
    mockList({ data: undefined, isPending: true });

    const { getByText, queryByText } = await open();

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByText("feedback.empty.title")).toBeNull();
  });

  it("relit la liste au réessai", async () => {
    const refetch = vi.fn();
    mockList({ data: undefined, isError: true, refetch });
    const { user, getByRole } = await open();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalled();
  });

  // Le clic passe par l'url, comme les liens venus d'ailleurs : un seul chemin d'ouverture.
  it("ouvre au clic le débrief choisi, par l'url", async () => {
    const { user, getByRole, router } = await open("f-1");

    await user.click(getByRole("button", { name: /Thomas Rey/ }));

    await waitFor(() => expect(router.state.location.search).toEqual({ feedback: "f-2" }));
  });

  it("referme la fiche de l'athlète", async () => {
    const { user, getByText, queryByText } = await open("f-1");
    fireEvent.click(getByText("feedback.detail.openSheet"));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(queryByText("athlete.sheet.description")).toBeNull());
  });

  // `repliedAt` vit dans la liste : c'est lui qui pose le badge « répondu » sur la ligne traitée.
  it("périme toute la boîte quand une réponse est partie", async () => {
    const { queryClient } = await open("f-1");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    reply.onSent();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: coachFeedbackKeys.all });
  });
});

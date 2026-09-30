import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type ConversationDto,
  type MessageDto,
  SELF_RELATION_ID,
} from "@cmv/shared";
import { type RenderResult, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi as athleteAccountApi } from "@/feature/athlete/api";
import { accountApi as coachAccountApi } from "@/feature/coach/api";
import { messageApi } from "@/feature/message/api";
import { MessagesScreen } from "@/feature/message/screen/MessagesScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Les VRAIS hooks, seuls les `api.ts` sont bouchonnés (« Tranché en #507 ») : ce qui s'éprouve ici
 * est ce que la messagerie DÉCIDE de réponses réelles — quelles lignes elle construit, quel fil
 * elle résout et à quel titre, ce qu'elle dit quand il n'y a rien ou quand ça tombe.
 *
 * Le titre exercé se lit de la session, pas d'un mock : un compte coach seul voit la messagerie du
 * coach, un compte athlète seul celle de l'athlète.
 */
const session = vi.hoisted(() => ({
  user: { id: "me", name: "Dual Curl", isCoach: true, isAthlete: false },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user }, isPending: false }) },
}));
vi.mock("@/feature/athlete/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/athlete/api")>();
  return { ...actual, accountApi: { ...actual.accountApi, listAthletes: vi.fn() } };
});
vi.mock("@/feature/coach/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/coach/api")>();
  return { ...actual, accountApi: { ...actual.accountApi, myCoach: vi.fn() } };
});
vi.mock("@/feature/message/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/message/api")>();
  return {
    ...actual,
    messageApi: {
      ...actual.messageApi,
      listConversations: vi.fn(),
      openConversation: vi.fn(),
      getMessages: vi.fn(),
      markRead: vi.fn(async () => undefined),
      sendMessage: vi.fn(),
    },
  };
});
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({ title, children }: Readonly<{ title: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {children as never}
    </div>
  ),
}));

function relation(overrides: Partial<CoachAthleteDto>): CoachAthleteDto {
  return {
    id: "rel-1",
    coachId: "me",
    coachName: "Dual Curl",
    athleteId: "a-1",
    athleteName: "Léa Moreau",
    status: CoachAthleteStatus.ACTIVE,
    invitedAt: "2026-01-01T00:00:00.000Z",
    joinedAt: "2026-01-02T00:00:00.000Z",
    isSelf: false,
    ...overrides,
  };
}

/** L'entrée synthétique que `GET /athletes` préfixe à la liste d'un compte qui se coache (#14). */
const SELF = relation({
  id: SELF_RELATION_ID,
  athleteId: "me",
  athleteName: "Dual Curl",
  joinedAt: null,
  isSelf: true,
});
const LEA = relation({});
const NOAH = relation({ id: "rel-2", athleteId: "a-2", athleteName: "Noah Fontaine" });
const INES = relation({ id: "rel-3", athleteId: "a-3", athleteName: "Inès Garnier" });

const conversation = (over: Partial<ConversationDto>): ConversationDto => ({
  id: "c-1",
  counterpartId: "a-1",
  counterpartName: "Léa Moreau",
  lastMessageAt: null,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
  ...over,
});

const message = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: "c-1",
    senderId: "a-1",
    type: "TEXT",
    content: `Message ${id}`,
    media: null,
    readAt: "2026-09-01T10:00:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...over,
  }) as MessageDto;

/**
 * Une ligne de fil est un `<button>`. Interroger le rôle et non le texte est ce qui distingue la
 * ligne du titre du fil ouvert, qui porte le même nom.
 */
const threadRow = (view: Pick<RenderResult, "queryByRole">, name: string) =>
  view.queryByRole("button", { name: new RegExp(name) });

type Sources = {
  athletes?: CoachAthleteDto[] | Error;
  conversations?: ConversationDto[] | Error;
};

async function open({ athletes = [LEA], conversations = [] }: Sources = {}, search = {}) {
  if (athletes instanceof Error)
    vi.mocked(athleteAccountApi.listAthletes).mockRejectedValueOnce(athletes);
  else vi.mocked(athleteAccountApi.listAthletes).mockResolvedValue(athletes);
  if (conversations instanceof Error)
    vi.mocked(messageApi.listConversations).mockRejectedValueOnce(conversations);
  else vi.mocked(messageApi.listConversations).mockResolvedValue(conversations);

  const view = await renderInRoute(<MessagesScreen />, {
    path: "/messages",
    search,
    links: ["/my-coach"],
  });
  await waitFor(() => expect(view.queryByText("common.loading")).toBeNull());
  return view;
}

beforeAll(() => {
  // jsdom ne défile pas : le fil colle au dernier message à chaque arrivée.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "me", name: "Dual Curl", isCoach: true, isAthlete: false };
  // Par défaut, la liste d'athlètes répond ; une panne ne vaut que pour le premier appel.
  vi.mocked(athleteAccountApi.listAthletes).mockResolvedValue([LEA]);
  vi.mocked(messageApi.listConversations).mockResolvedValue([]);
  vi.mocked(messageApi.openConversation).mockResolvedValue(conversation({}));
  vi.mocked(messageApi.getMessages).mockResolvedValue([message("m-1")]);
});

describe("MessagesScreen — côté coach, la liste", () => {
  it("liste un fil par athlète, en invitant à en choisir un", async () => {
    const view = await open();

    expect(threadRow(view, "Léa Moreau")).not.toBeNull();
    expect(view.getByText("messages.pickThread.title")).toBeInTheDocument();
    // Rien n'est résolu tant qu'aucun fil n'est choisi : ouvrir un fil le CRÉE au besoin.
    expect(messageApi.openConversation).not.toHaveBeenCalled();
  });

  /**
   * Le cœur de #198 : le compte s'affichait comme son propre interlocuteur, en tête de liste, et
   * le sélectionner tombait sur un écran d'erreur — le fil `(soi, soi)` ne peut pas exister.
   */
  it("ne se montre pas à lui-même dans sa liste de fils", async () => {
    const view = await open({ athletes: [SELF, LEA] });

    expect(threadRow(view, "Dual Curl")).toBeNull();
    expect(threadRow(view, "Léa Moreau")).not.toBeNull();
  });

  // Les fils les plus récemment actifs d'abord, puis les athlètes sans échange, dans leur ordre.
  it("range les fils actifs par récence, puis les athlètes sans échange", async () => {
    const view = await open({
      athletes: [LEA, NOAH, INES],
      conversations: [
        conversation({ id: "c-1", counterpartId: "a-1", lastMessageAt: "2026-09-01T10:00:00Z" }),
        conversation({ id: "c-3", counterpartId: "a-3", lastMessageAt: "2026-09-20T10:00:00Z" }),
      ],
    });

    const names = view
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /Léa|Noah|Inès/.test(text))
      .map((text) => text.match(/Léa Moreau|Noah Fontaine|Inès Garnier/)?.[0]);
    expect(names).toEqual(["Inès Garnier", "Léa Moreau", "Noah Fontaine"]);
  });

  // Un média n'a pas de texte à citer : son type se traduit. Un fil vide le dit.
  it("aperçoit le dernier message, le type d'un média, ou l'absence d'échange", async () => {
    const view = await open({
      athletes: [LEA, NOAH, INES],
      conversations: [
        conversation({
          counterpartId: "a-1",
          lastMessageAt: "2026-09-20T10:00:00Z",
          lastMessagePreview: "À demain",
          unreadCount: 3,
        }),
        conversation({
          id: "c-2",
          counterpartId: "a-2",
          lastMessageAt: "2026-09-10T10:00:00Z",
          lastMessageType: "AUDIO",
        }),
      ],
    });

    expect(threadRow(view, "Léa Moreau")?.textContent).toContain("À demain");
    // Les non-lus se comptent sur la ligne.
    expect(threadRow(view, "Léa Moreau")?.textContent).toContain("3");
    expect(threadRow(view, "Noah Fontaine")?.textContent).toContain("messages.preview.AUDIO");
    expect(threadRow(view, "Inès Garnier")?.textContent).toContain("messages.noMessages");
  });

  /**
   * Le cas le plus visible : un compte auto-coaché SANS athlète tiers. `rows` valait `[soi]`, donc
   * l'état vide n'était jamais rendu — une ligne morte le remplaçait.
   */
  it("dit le vide à un compte qui n'a que lui-même dans sa liste", async () => {
    const view = await open({ athletes: [SELF] });

    expect(view.queryByText("messages.noAthletes.title")).not.toBeNull();
    expect(threadRow(view, "Dual Curl")).toBeNull();
  });

  it("dit le vide quand aucun athlète n'a rejoint", async () => {
    const view = await open({ athletes: [] });

    expect(view.queryByText("messages.noAthletes.title")).not.toBeNull();
  });

  // Trois états distincts, jamais confondus : « aucun athlète » sur une panne réseau serait un
  // mensonge.
  it("dit la panne plutôt que le vide, et relit les deux sources au réessai", async () => {
    const view = await open({ conversations: new Error("réseau") });

    expect(view.queryByText("common.errorTitle")).not.toBeNull();
    expect(view.queryByText("messages.noAthletes.title")).toBeNull();

    await view.user.click(view.getByRole("button", { name: "common.retry" }));

    await waitFor(() => expect(threadRow(view, "Léa Moreau")).not.toBeNull());
    expect(athleteAccountApi.listAthletes).toHaveBeenCalledTimes(2);
    expect(messageApi.listConversations).toHaveBeenCalledTimes(2);
  });
});

describe("MessagesScreen — côté coach, le fil", () => {
  // Le fil ouvert vit dans l'url : c'est ce qui permet d'y arriver depuis le suivi (#113).
  it("ouvre le fil choisi en coach, et l'écrit dans l'url sans perdre le titre", async () => {
    const view = await open({}, { as: "coach" });

    await view.user.click(threadRow(view, "Léa Moreau") as HTMLElement);

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(view.router.state.location.search).toEqual({ athlete: "a-1", as: "coach" });
    expect(messageApi.openConversation).toHaveBeenCalledWith({ athleteId: "a-1" }, "coach");
    expect(threadRow(view, "Léa Moreau")).toHaveClass("bg-cmv-surface");
  });

  it("arrive sur le fil désigné par l'url", async () => {
    const view = await open({}, { athlete: "a-1" });

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "Léa Moreau" })).toBeInTheDocument();
  });

  // Un athlète inconnu (lien périmé, athlète parti) ne résout aucun fil.
  it("invite à choisir quand l'athlète de l'url n'est pas dans la liste", async () => {
    const view = await open({}, { athlete: "a-inconnu" });

    expect(view.getByText("messages.pickThread.title")).toBeInTheDocument();
    expect(messageApi.openConversation).not.toHaveBeenCalled();
  });

  it("dit un fil sans message", async () => {
    vi.mocked(messageApi.getMessages).mockResolvedValue([]);
    const view = await open({}, { athlete: "a-1" });

    expect(await view.findByText("messages.empty.description")).toBeInTheDocument();
  });

  it("dit l'échec de résolution du fil, et le résout de nouveau au réessai", async () => {
    vi.mocked(messageApi.openConversation).mockRejectedValueOnce(new Error("réseau"));
    const view = await open({}, { athlete: "a-1" });

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(messageApi.openConversation).toHaveBeenCalledTimes(2);
  });

  it("envoie un texte dans le fil résolu, puis relit le fil et la liste", async () => {
    vi.mocked(messageApi.sendMessage).mockResolvedValue(message("m-2"));
    const view = await open({}, { athlete: "a-1" });
    await view.findByText("Message m-1");

    await view.user.type(view.getByPlaceholderText("messages.placeholder"), "Bien reçu{Enter}");

    await waitFor(() =>
      expect(messageApi.sendMessage).toHaveBeenCalledWith(
        "c-1",
        { type: "TEXT", content: "Bien reçu" },
        null,
      ),
    );
    await waitFor(() => expect(messageApi.getMessages).toHaveBeenCalledTimes(2));
    expect(messageApi.listConversations).toHaveBeenCalledTimes(2);
  });

  it("dit l'échec d'un envoi", async () => {
    vi.mocked(messageApi.sendMessage).mockRejectedValue(new Error("réseau"));
    const view = await open({}, { athlete: "a-1" });
    await view.findByText("Message m-1");

    await view.user.type(view.getByPlaceholderText("messages.placeholder"), "Bien reçu{Enter}");

    expect(await view.findByRole("status")).toHaveTextContent("common.error");
  });

  // Un entrant non lu se marque lu à l'ouverture, et la liste relit ses compteurs.
  it("marque lu un entrant non lu, et relit la liste", async () => {
    vi.mocked(messageApi.getMessages).mockResolvedValue([message("m-1", { readAt: null })]);
    const view = await open({}, { athlete: "a-1" });

    await waitFor(() => expect(messageApi.markRead).toHaveBeenCalledWith("c-1", null));
    await waitFor(() => expect(messageApi.listConversations).toHaveBeenCalledTimes(2));
    expect(view.getByText("Message m-1")).toBeInTheDocument();
  });
});

describe("MessagesScreen — côté athlète", () => {
  beforeEach(() => {
    session.user = { id: "me", name: "Léa Moreau", isCoach: false, isAthlete: true };
  });

  it("dit qu'il charge tant que le coach n'est pas connu", async () => {
    vi.mocked(coachAccountApi.myCoach).mockReturnValue(new Promise(() => {}));

    const view = await renderInRoute(<MessagesScreen />, { path: "/messages" });

    expect(view.getByText("common.loading")).toBeInTheDocument();
  });

  it("ouvre SON fil avec son coach, en athlète, sans colonne de fils", async () => {
    vi.mocked(coachAccountApi.myCoach).mockResolvedValue(relation({ coachName: "Marc Keller" }));
    const view = await renderInRoute(<MessagesScreen />, { path: "/messages" });

    expect(await view.findByRole("heading", { name: "Marc Keller" })).toBeInTheDocument();
    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(messageApi.openConversation).toHaveBeenCalledWith({}, "athlete");
    // La liste des athlètes est une lecture de coach : un athlète n'a pas à la demander.
    expect(athleteAccountApi.listAthletes).not.toHaveBeenCalled();
  });

  // Sans coach, pas de fil (l'API refuserait) : on dit où en rejoindre un.
  it("renvoie vers « mon coach » quand il n'en a pas", async () => {
    vi.mocked(coachAccountApi.myCoach).mockResolvedValue(null);
    const view = await renderInRoute(<MessagesScreen />, {
      path: "/messages",
      links: ["/my-coach"],
    });

    const link = await view.findByRole("link", { name: "messages.athlete.noCoach.action" });
    expect(link).toHaveAttribute("href", "/my-coach");
    expect(messageApi.openConversation).not.toHaveBeenCalled();
  });

  it("dit la panne, et relit le coach au réessai", async () => {
    vi.mocked(coachAccountApi.myCoach)
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValue(relation({ coachName: "Marc Keller" }));
    const view = await renderInRoute(<MessagesScreen />, { path: "/messages" });

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByRole("heading", { name: "Marc Keller" })).toBeInTheDocument();
  });

  it("dit l'échec de résolution de son fil, et le résout de nouveau au réessai", async () => {
    vi.mocked(coachAccountApi.myCoach).mockResolvedValue(relation({ coachName: "Marc Keller" }));
    vi.mocked(messageApi.openConversation).mockRejectedValueOnce(new Error("réseau"));
    const view = await renderInRoute(<MessagesScreen />, { path: "/messages" });

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(messageApi.openConversation).toHaveBeenCalledTimes(2);
  });
});

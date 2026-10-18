import type {
  ConversationCandidatesDto,
  ConversationDto,
  ConversationParticipantDto,
  MessageDto,
} from "@cmv/shared";
import { type RenderResult, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { messageApi } from "@/feature/message/api";
import { MessagesScreen } from "@/feature/message/screen/MessagesScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Les VRAIS hooks, seuls les `api.ts` sont bouchonnés (« Tranché en #507 ») : ce qui s'éprouve ici
 * est ce que la messagerie DÉCIDE de réponses réelles — quelles lignes elle montre, quel fil elle
 * ouvre et à quel titre, qui elle propose de réunir, ce qu'elle dit quand il n'y a rien ou quand
 * ça tombe.
 *
 * Les données de la phase multi-coach (#593) : C et M (entreprise F), TE et TI. C suit TE et TI,
 * M ne suit que TI. Le titre exercé se lit de la session, pas d'un mock.
 */
const session = vi.hoisted(() => ({
  user: { id: "me", name: "C", isCoach: true, isAthlete: false },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user }, isPending: false }) },
}));
vi.mock("@/feature/message/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/message/api")>();
  return {
    ...actual,
    messageApi: {
      ...actual.messageApi,
      listConversations: vi.fn(),
      listCandidates: vi.fn(),
      createConversation: vi.fn(),
      getMessages: vi.fn(),
      markRead: vi.fn(async () => undefined),
      sendMessage: vi.fn(),
    },
  };
});
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici. Ses
// actions, elles, portent « Nouvelle conversation ».
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    actions,
    children,
  }: Readonly<{ title: string; actions?: unknown; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {actions as never}
      {children as never}
    </div>
  ),
}));

const person = (
  userId: string,
  capability: "coach" | "athlete",
  lastReadAt: string | null = null,
): ConversationParticipantDto => ({ userId, name: userId.toUpperCase(), capability, lastReadAt });

const conversation = (over: Partial<ConversationDto> = {}): ConversationDto => ({
  id: "c-ti",
  kind: "DIRECT",
  participants: [person("ti", "athlete")],
  lastReadAt: null,
  lastMessageAt: null,
  lastMessageSenderId: null,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
  createdAt: "2026-10-05T08:00:00.000Z",
  ...over,
});

const GROUP = conversation({
  id: "c-group",
  kind: "GROUP",
  participants: [person("m", "coach"), person("ti", "athlete")],
});

const message = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: "c-ti",
    senderId: "ti",
    type: "TEXT",
    content: `Message ${id}`,
    media: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    ...over,
  }) as MessageDto;

const COACH_CANDIDATES: ConversationCandidatesDto = {
  athletes: [
    { userId: "te", name: "TE" },
    { userId: "ti", name: "TI" },
  ],
  coaches: [{ userId: "m", name: "M", organizationNames: ["F"], followedAthleteIds: ["ti"] }],
};
const NOBODY: ConversationCandidatesDto = { athletes: [], coaches: [] };

/**
 * Une ligne de la liste est un `<button>`. Interroger le rôle et non le texte est ce qui distingue
 * la ligne du titre du fil ouvert, qui porte le même nom.
 */
const row = (view: Pick<RenderResult, "queryByRole">, name: string) =>
  view.queryByRole("button", { name: new RegExp(`^${name}`) });

type Sources = {
  conversations?: ConversationDto[] | Error;
  /** Ce que rendent les relectures suivantes de la liste, quand elles diffèrent de la première. */
  thenConversations?: ConversationDto[];
  candidates?: ConversationCandidatesDto | Error;
};

async function open(
  {
    conversations = [conversation()],
    thenConversations,
    candidates = COACH_CANDIDATES,
  }: Sources = {},
  search = {},
) {
  if (conversations instanceof Error)
    vi.mocked(messageApi.listConversations).mockRejectedValueOnce(conversations);
  else
    vi.mocked(messageApi.listConversations)
      .mockResolvedValue(thenConversations ?? conversations)
      .mockResolvedValueOnce(conversations);
  if (candidates instanceof Error)
    vi.mocked(messageApi.listCandidates).mockRejectedValueOnce(candidates);
  else vi.mocked(messageApi.listCandidates).mockResolvedValue(candidates);

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
  session.user = { id: "me", name: "C", isCoach: true, isAthlete: false };
  vi.mocked(messageApi.listConversations).mockResolvedValue([conversation()]);
  vi.mocked(messageApi.listCandidates).mockResolvedValue(COACH_CANDIDATES);
  vi.mocked(messageApi.createConversation).mockResolvedValue(conversation());
  vi.mocked(messageApi.getMessages).mockResolvedValue([message("m-1")]);
});

describe("MessagesScreen — la liste", () => {
  // Une ligne par conversation, plus par interlocuteur (tranché en #612) : TE, jamais contacté,
  // n'a pas de ligne.
  it("liste les conversations, à deux comme à plusieurs, en invitant à en choisir une", async () => {
    const view = await open({ conversations: [GROUP, conversation()] });

    expect(row(view, "M, TI")).not.toBeNull();
    expect(row(view, "TI")).not.toBeNull();
    expect(row(view, "TE")).toBeNull();
    expect(view.getByText("messages.pickThread.title")).toBeInTheDocument();
    expect(messageApi.createConversation).not.toHaveBeenCalled();
  });

  it("préfixe l'aperçu de son auteur : moi, ou un autre à plusieurs", async () => {
    const view = await open({
      conversations: [
        {
          ...GROUP,
          lastMessageSenderId: "m",
          lastMessagePreview: "Salut",
          lastMessageType: "TEXT",
        },
        conversation({
          lastMessageSenderId: "me",
          lastMessageType: "IMAGE",
          lastMessageAt: "2026-10-05T10:00:00.000Z",
        }),
      ],
    });

    expect(row(view, "M, TI")).toHaveTextContent("messages.previewAuthor");
    expect(row(view, "TI")).toHaveTextContent("messages.previewSelf");
  });

  // E3 : une conversation sans message, en tête de liste — aperçu et date « — ».
  it("rend « — » pour l'aperçu et la date d'une conversation vide", async () => {
    const view = await open({ conversations: [GROUP] });

    expect(within(row(view, "M, TI") as HTMLElement).getAllByText("—")).toHaveLength(2);
  });

  it("aperçoit un média par son type, sans préfixe à deux", async () => {
    const view = await open({
      conversations: [
        conversation({ lastMessageSenderId: "ti", lastMessageType: "AUDIO", unreadCount: 2 }),
      ],
    });

    expect(row(view, "TI")).toHaveTextContent("messages.preview.AUDIO");
    expect(row(view, "TI")).not.toHaveTextContent("messages.previewAuthor");
    expect(row(view, "TI")).toHaveTextContent("2");
  });

  it("invite à la première conversation quand il y a quelqu'un à qui écrire", async () => {
    const view = await open({ conversations: [] });

    expect(view.getByText("messages.noConversations.title")).toBeInTheDocument();
    expect(view.getByText("messages.noConversations.coach")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "messages.newConversation" })).toBeInTheDocument();
  });

  // Personne à réunir : rien à créer, le bouton n'est pas proposé (E1).
  it("dit le vide à un Coach sans athlète ni collègue", async () => {
    const view = await open({ conversations: [], candidates: NOBODY });

    expect(view.getByText("messages.noAthletes.title")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "messages.newConversation" })).toBeNull();
  });

  it("dit la panne plutôt que le vide, et relit les deux sources au réessai", async () => {
    const view = await open({ conversations: new Error("réseau") });

    expect(view.queryByText("messages.noConversations.title")).toBeNull();
    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    await waitFor(() => expect(row(view, "TI")).not.toBeNull());
    expect(messageApi.listConversations).toHaveBeenCalledTimes(2);
    expect(messageApi.listCandidates).toHaveBeenCalledTimes(2);
  });
});

describe("MessagesScreen — le fil", () => {
  it("ouvre la conversation choisie, et l'écrit dans l'url sans perdre le titre", async () => {
    const view = await open({}, { as: "coach" });

    await view.user.click(row(view, "TI") as HTMLElement);

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(view.router.state.location.search).toEqual({ conversation: "c-ti", as: "coach" });
    expect(row(view, "TI")).toHaveClass("bg-cmv-surface");
    expect(messageApi.createConversation).not.toHaveBeenCalled();
  });

  // Une notification ne connaît que la conversation : elle suffit, à plusieurs aussi.
  it("arrive sur la conversation que l'url désigne", async () => {
    const view = await open(
      { conversations: [conversation(), GROUP] },
      { conversation: "c-group" },
    );

    expect(await view.findByRole("heading", { name: "M, TI" })).toBeInTheDocument();
  });

  it("invite à choisir quand la conversation de l'url n'est pas dans la liste", async () => {
    const view = await open({}, { conversation: "c-inconnue" });

    expect(view.getByText("messages.pickThread.title")).toBeInTheDocument();
  });

  // Le tableau de suivi ouvre le fil d'un athlète (#113) : à deux, créé au besoin, puis l'url passe
  // à la conversation — même si la liste ne la porte pas encore.
  it("ouvre le fil à deux avec l'athlète de l'url, en Coach", async () => {
    // La relecture qui suit l'ouverture porte le fil, comme l'API le ferait.
    const view = await open(
      { conversations: [], thenConversations: [conversation()] },
      { athlete: "ti" },
    );

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(messageApi.createConversation).toHaveBeenCalledWith(
      { participants: [{ userId: "ti", capability: "athlete" }] },
      "coach",
    );
    expect(view.router.state.location.search).toEqual({ conversation: "c-ti" });
  });

  // Un lien périmé (athlète parti) n'est pas un candidat : rien ne part, l'API refuserait.
  it("n'ouvre rien vers un athlète qui n'est pas un candidat", async () => {
    const view = await open({}, { athlete: "a-inconnu" });

    expect(view.getByText("messages.pickThread.title")).toBeInTheDocument();
    expect(messageApi.createConversation).not.toHaveBeenCalled();
  });

  it("dit l'échec d'ouverture du fil, et l'ouvre de nouveau au réessai", async () => {
    vi.mocked(messageApi.createConversation).mockRejectedValueOnce(new Error("réseau"));
    const view = await open({}, { athlete: "ti" });

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByText("Message m-1")).toBeInTheDocument();
    expect(messageApi.createConversation).toHaveBeenCalledTimes(2);
  });

  it("envoie un texte, puis relit le fil et la liste", async () => {
    vi.mocked(messageApi.sendMessage).mockResolvedValue(message("m-2"));
    // Fil déjà lu : seul l'envoi relit la liste, pas un marquage.
    const view = await open(
      { conversations: [conversation({ lastReadAt: "2026-10-05T11:00:00.000Z" })] },
      { conversation: "c-ti" },
    );
    await view.findByText("Message m-1");

    await view.user.type(view.getByPlaceholderText("messages.placeholder"), "Bien reçu{Enter}");

    await waitFor(() =>
      expect(messageApi.sendMessage).toHaveBeenCalledWith(
        "c-ti",
        { type: "TEXT", content: "Bien reçu" },
        null,
      ),
    );
    await waitFor(() => expect(messageApi.getMessages).toHaveBeenCalledTimes(2));
    expect(messageApi.listConversations).toHaveBeenCalledTimes(2);
  });

  it("marque lu un entrant non lu, et relit la liste", async () => {
    const view = await open(
      { conversations: [conversation({ lastReadAt: "2026-10-05T09:00:00.000Z" })] },
      { conversation: "c-ti" },
    );

    await waitFor(() => expect(messageApi.markRead).toHaveBeenCalledWith("c-ti", null));
    await waitFor(() => expect(messageApi.listConversations).toHaveBeenCalledTimes(2));
    expect(view.getByText("Message m-1")).toBeInTheDocument();
  });
});

describe("MessagesScreen — nouvelle conversation, côté Coach (B2)", () => {
  async function openPanel() {
    const view = await open();
    await view.user.click(view.getByRole("button", { name: "messages.newConversation" }));
    return view;
  }

  // Dans le panneau : la liste derrière lui porte aussi une ligne « TI ».
  const panel = (view: RenderResult) =>
    within(view.getByRole("complementary", { name: "messages.new.title" }));
  const candidate = (view: RenderResult, name: string) =>
    panel(view).getByRole("button", { name: new RegExp(`^${name}`), pressed: false });

  it("propose ses athlètes et les Coachs de son entreprise, « Créer » fermé sans choix", async () => {
    const view = await openPanel();

    expect(view.getByText("messages.new.athletes")).toBeInTheDocument();
    expect(view.getByText("messages.new.coachesOf")).toBeInTheDocument();
    expect(candidate(view, "TE")).toBeInTheDocument();
    expect(candidate(view, "M")).toHaveTextContent("messages.new.ofOrganizations");
    expect(view.getByRole("button", { name: "messages.new.create" })).toBeDisabled();
  });

  it("filtre les candidats par la recherche", async () => {
    const view = await openPanel();

    await view.user.type(view.getByLabelText("messages.new.searchLabel"), "te");

    expect(panel(view).queryByRole("button", { name: /^TI/ })).toBeNull();
    expect(candidate(view, "TE")).toBeInTheDocument();

    await view.user.clear(view.getByLabelText("messages.new.searchLabel"));
    await view.user.type(view.getByLabelText("messages.new.searchLabel"), "zzz");
    expect(view.getByText("messages.new.noResult")).toBeInTheDocument();
  });

  // Les deux avertissements, cumulables : prévenir plutôt qu'interdire (tranché en #598).
  it("prévient que les athlètes se verront, et que M ne suit pas TE", async () => {
    const view = await openPanel();

    await view.user.click(candidate(view, "TE"));
    expect(view.queryByText("messages.new.athletesWarning")).toBeNull();
    await view.user.click(candidate(view, "TI"));
    expect(view.getByText("messages.new.athletesWarning")).toBeInTheDocument();

    await view.user.click(candidate(view, "M"));
    expect(view.getByText("messages.new.unfollowedWarning")).toBeInTheDocument();
    expect(view.getByText("messages.new.chosen")).toBeInTheDocument();
  });

  it("retire un participant choisi depuis sa pastille", async () => {
    const view = await openPanel();
    await view.user.click(candidate(view, "TE"));

    // La pastille, puis la ligne : deux boutons pressés portent le nom.
    const [chip] = view.getAllByRole("button", { name: /^TE/, pressed: true });
    await view.user.click(chip as HTMLElement);

    expect(view.getByRole("button", { name: "messages.new.create" })).toBeDisabled();
  });

  // L'API rouvre la conversation qui réunit déjà ces participants : le panneau ouvre ce qu'elle rend.
  it("crée la conversation, puis l'ouvre et ferme le panneau", async () => {
    vi.mocked(messageApi.createConversation).mockResolvedValue(GROUP);
    const view = await openPanel();
    vi.mocked(messageApi.listConversations).mockResolvedValue([GROUP, conversation()]);

    await view.user.click(candidate(view, "M"));
    await view.user.click(candidate(view, "TI"));
    await view.user.click(view.getByRole("button", { name: "messages.new.create" }));

    expect(await view.findByRole("heading", { name: "M, TI" })).toBeInTheDocument();
    expect(messageApi.createConversation).toHaveBeenCalledWith(
      {
        participants: [
          { userId: "m", capability: "coach" },
          { userId: "ti", capability: "athlete" },
        ],
      },
      null,
    );
    expect(view.router.state.location.search).toEqual({ conversation: "c-group" });
    expect(view.queryByText("messages.new.title")).toBeNull();
  });

  // Un refus (participant qui n'est plus candidat) se dit, et le choix reste là pour réessayer.
  it("dit l'échec de la création, panneau ouvert", async () => {
    vi.mocked(messageApi.createConversation).mockRejectedValue(new Error("refus"));
    const view = await openPanel();

    await view.user.click(candidate(view, "TE"));
    await view.user.click(view.getByRole("button", { name: "messages.new.create" }));

    expect(await view.findByText("common.error")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "messages.new.create" })).toBeEnabled();
  });

  it("referme le panneau sans rien créer", async () => {
    const view = await openPanel();

    await view.user.click(view.getByRole("button", { name: "common.cancel" }));

    expect(view.queryByText("messages.new.title")).toBeNull();
    expect(messageApi.createConversation).not.toHaveBeenCalled();
  });
});

describe("MessagesScreen — côté athlète", () => {
  const MY_COACHES: ConversationCandidatesDto = {
    athletes: [],
    coaches: [
      { userId: "c", name: "C", organizationNames: [], followedAthleteIds: null },
      { userId: "m", name: "M", organizationNames: ["F"], followedAthleteIds: null },
    ],
  };
  const WITH_C = conversation({ id: "c-c", participants: [person("c", "coach")] });

  beforeEach(() => {
    session.user = { id: "me", name: "TI", isCoach: false, isAthlete: true };
  });

  it("dit qu'il charge tant que ses conversations ne sont pas connues", async () => {
    vi.mocked(messageApi.listConversations).mockReturnValue(new Promise(() => {}));

    const view = await renderInRoute(<MessagesScreen />, { path: "/messages" });

    expect(view.getByText("common.loading")).toBeInTheDocument();
  });

  // Sans coach, personne à réunir : on dit où en rejoindre un, coach ou entreprise.
  it("renvoie vers ses coachs quand il n'en a aucun", async () => {
    const view = await open({ conversations: [], candidates: NOBODY });

    const link = await view.findByRole("link", { name: "messages.athlete.noCoach.action" });
    expect(link).toHaveAttribute("href", "/my-coach");
    expect(view.queryByRole("button", { name: "messages.newConversation" })).toBeNull();
  });

  it("invite à écrire à ses coachs quand il n'a aucune conversation", async () => {
    const view = await open({ conversations: [], candidates: MY_COACHES });

    expect(view.getByText("messages.noConversations.athlete")).toBeInTheDocument();
  });

  // « Mes coachs » ouvre le fil avec un coach : à deux, en athlète.
  it("ouvre le fil à deux avec le coach de l'url, en athlète", async () => {
    vi.mocked(messageApi.createConversation).mockResolvedValue(WITH_C);
    const view = await open({ conversations: [WITH_C], candidates: MY_COACHES }, { coach: "c" });

    expect(await view.findByRole("heading", { name: "C" })).toBeInTheDocument();
    expect(messageApi.createConversation).toHaveBeenCalledWith(
      { participants: [{ userId: "c", capability: "coach" }] },
      "athlete",
    );
  });

  // A2 : ses coachs, avec la provenance de chaque lien ; ni recherche ni avertissement.
  it("propose ses coachs avec leur provenance, sans recherche", async () => {
    const view = await open({ conversations: [WITH_C], candidates: MY_COACHES });

    await view.user.click(view.getByRole("button", { name: "messages.newConversation" }));

    expect(view.getByText("messages.new.myCoaches")).toBeInTheDocument();
    expect(view.getByRole("button", { name: /^M/, pressed: false })).toHaveTextContent(
      "messages.new.viaOrganizations",
    );
    expect(view.getByRole("button", { name: /^C/, pressed: false })).toHaveTextContent(
      "messages.capability.coach",
    );
    expect(view.queryByLabelText("messages.new.searchLabel")).toBeNull();
  });
});

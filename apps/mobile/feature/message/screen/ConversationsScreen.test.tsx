import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type ConversationDto,
  MessageType,
  SELF_RELATION_ID,
} from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAthletes } from "@/feature/athlete";
import { useMyCoaches } from "@/feature/coach/hook/useMyCoach";
import { useConversations } from "@/feature/message/hook/useConversation";
import {
  AthleteConversationsScreen,
  CoachConversationsScreen,
} from "@/feature/message/screen/ConversationsScreen";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que la liste DÉCIDE — quelles lignes elle construit à partir des athlètes, et ce qu'elle
 * montre quand il n'en reste aucune.
 */
vi.mock("@/feature/athlete", () => ({ useAthletes: vi.fn() }));
vi.mock("@/feature/coach/hook/useMyCoach", () => ({ useMyCoaches: vi.fn() }));
vi.mock("@/feature/message/hook/useConversation", () => ({ useConversations: vi.fn() }));
vi.mock("@/feature/notification/hook/useNotifications", () => ({
  useUnreadByCapability: () => ({ data: undefined }),
}));
// Le sélecteur d'espace lit la session et navigue : hors sujet ici, et il tirerait tout `expo-router`.
vi.mock("@/shared/component/CmvCapabilitySwitch", () => ({ CmvCapabilitySwitch: () => null }));

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
    organizationName: null,
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

function mockAthletes(state: Record<string, unknown>): void {
  vi.mocked(useAthletes).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useAthletes>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAthletes({});
  vi.mocked(useConversations).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useConversations>);
});

describe("CoachConversationsScreen", () => {
  /**
   * #309 : le cache persisté est frais 5 min. Sans relecture à l'affichage, un message arrivé
   * pendant que le coach était sur un autre onglet n'allume sa pastille qu'au tirer-pour-rafraîchir.
   */
  it("relit les fils à l'affichage, sans relire les athlètes", () => {
    const refetchConversations = vi.fn();
    const refetchAthletes = vi.fn();
    mockAthletes({ refetch: refetchAthletes });
    vi.mocked(useConversations).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isRefetching: false,
      refetch: refetchConversations,
    } as unknown as ReturnType<typeof useConversations>);

    renderRn(<CoachConversationsScreen />);

    expect(refetchConversations).toHaveBeenCalledOnce();
    expect(refetchAthletes).not.toHaveBeenCalled();
  });

  it("liste un fil par athlète", async () => {
    mockAthletes({ data: [LEA] });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("Léa Moreau")).not.toBeNull();
  });

  /**
   * Le cœur de #198 : le compte s'affichait comme son propre interlocuteur, et le sélectionner
   * ouvrait un fil `(soi, soi)` que l'API refuse.
   */
  it("ne se montre pas à lui-même dans sa liste de fils", async () => {
    mockAthletes({ data: [SELF, LEA] });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("Dual Curl")).toBeNull();
    expect(queryByText("Léa Moreau")).not.toBeNull();
  });

  /**
   * Le cas le plus visible : un compte auto-coaché SANS athlète tiers. `rows` valait `[soi]`, donc
   * l'état vide n'était jamais rendu — une ligne morte le remplaçait.
   */
  it("dit le vide à un compte qui n'a que lui-même dans sa liste", async () => {
    mockAthletes({ data: [SELF] });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("messages.noAthletes.title")).not.toBeNull();
    expect(queryByText("Dual Curl")).toBeNull();
  });

  it("dit le vide quand aucun athlète n'a rejoint", async () => {
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("messages.noAthletes.title")).not.toBeNull();
  });

  // Trois états distincts, jamais confondus : « aucun athlète » sur une panne réseau serait un
  // mensonge, et le vide ne se montre pas tant que la liste charge.
  it("dit la panne plutôt que le vide", async () => {
    mockAthletes({ data: undefined, isError: true });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("messages.noAthletes.title")).toBeNull();
  });
});

function conversation(overrides: Partial<ConversationDto>): ConversationDto {
  return {
    id: "conv-1",
    counterpartId: "a-1",
    counterpartName: "Léa Moreau",
    lastMessageAt: "2026-09-29T08:00:00.000Z",
    lastMessageType: MessageType.TEXT,
    lastMessagePreview: "À demain",
    unreadCount: 0,
    ...overrides,
  };
}

function mockConversations(state: Record<string, unknown>): void {
  vi.mocked(useConversations).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useConversations>);
}

const SARAH = relation({ id: "rel-2", athleteId: "a-2", athleteName: "Sarah Nguyen" });
const TOM = relation({ id: "rel-3", athleteId: "a-3", athleteName: "Tom Petit" });

describe("CoachConversationsScreen — une ligne", () => {
  /** Le dernier échange en tête ; un athlète jamais contacté ferme la marche. */
  it("range les fils du plus récent au plus ancien, les muets en dernier", () => {
    // Le muet AU MILIEU de la liste servie : le tri le compare des deux côtés, jamais d'un seul.
    mockAthletes({ data: [LEA, TOM, SARAH] });
    mockConversations({
      data: [
        conversation({ counterpartId: "a-1", lastMessageAt: "2026-09-01T08:00:00.000Z" }),
        conversation({
          id: "conv-2",
          counterpartId: "a-2",
          lastMessageAt: "2026-09-29T08:00:00.000Z",
        }),
      ],
    });
    const { getAllByText } = renderRn(<CoachConversationsScreen />);

    const names = getAllByText(/Léa Moreau|Sarah Nguyen|Tom Petit/).map((node) => node.textContent);
    expect(names).toEqual(["Sarah Nguyen", "Léa Moreau", "Tom Petit"]);
  });

  it.each([
    ["le texte du dernier message", conversation({}), "À demain"],
    [
      "le type du média quand il n'y a pas de texte",
      conversation({ lastMessagePreview: null, lastMessageType: MessageType.IMAGE }),
      "messages.preview.IMAGE",
    ],
    [
      "« aucun message » sur un texte sans aperçu",
      conversation({ lastMessagePreview: null }),
      "messages.noMessageYet",
    ],
    [
      "« aucun message » sur un fil ouvert mais vide",
      conversation({ lastMessagePreview: null, lastMessageType: null, lastMessageAt: null }),
      "messages.noMessageYet",
    ],
  ])("montre en aperçu %s", (_, served, preview) => {
    mockAthletes({ data: [LEA] });
    mockConversations({ data: [served] });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText(preview)).not.toBeNull();
  });

  /** Aucun échange : ni date inventée, ni pastille. */
  it("ne date rien et ne compte rien sur un athlète jamais contacté", () => {
    mockAthletes({ data: [LEA] });
    mockConversations({ data: undefined });
    const { queryByText, container } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("messages.noMessageYet")).not.toBeNull();
    expect(queryByText("—")).not.toBeNull();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("compte les messages non lus du fil", () => {
    mockAthletes({ data: [LEA] });
    mockConversations({ data: [conversation({ unreadCount: 3 })] });
    const { queryByText } = renderRn(<CoachConversationsScreen />);

    expect(queryByText("3")).not.toBeNull();
  });

  it("ouvre le fil de l'athlète touché", () => {
    mockAthletes({ data: [LEA] });
    const { getByText } = renderRn(<CoachConversationsScreen />);

    press(getByText("Léa Moreau"));

    expect(router.push).toHaveBeenCalledWith("/messages/a-1");
  });
});

describe("CoachConversationsScreen — chargement, panne, rafraîchissement", () => {
  it("n'affirme rien tant qu'une des deux listes charge", () => {
    mockConversations({ data: undefined, isPending: true });
    const { container, queryByText } = renderRn(<CoachConversationsScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(queryByText("messages.noAthletes.title")).toBeNull();
  });

  it.each([
    ["réessaie", (container: HTMLElement) => pressButton(container, "common.retry")],
    [
      "tire l'écran",
      (container: HTMLElement) => press(container.querySelector("[data-refresh]") as HTMLElement),
    ],
  ])("relit les athlètes ET les fils quand le coach %s", (_, gesture) => {
    const athletes = vi.fn();
    const conversations = vi.fn();
    mockAthletes({ data: undefined, isError: true, refetch: athletes });
    mockConversations({ refetch: conversations });
    const { container } = renderRn(<CoachConversationsScreen />);
    // Le premier plan a déjà relu les fils une fois : seul compte ce que le geste ajoute.
    conversations.mockClear();

    gesture(container);

    expect(athletes).toHaveBeenCalledOnce();
    expect(conversations).toHaveBeenCalledOnce();
  });
});

function mockCoaches(state: Record<string, unknown>): void {
  vi.mocked(useMyCoaches).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useMyCoaches>);
}

const JULIE = relation({ id: "rel-j", coachId: "c-1", coachName: "Julie Renaud", athleteId: "me" });
const MARC = relation({ id: "rel-m", coachId: "c-2", coachName: "Marc Keller", athleteId: "me" });

describe("AthleteConversationsScreen (#599)", () => {
  beforeEach(() => mockCoaches({ data: [JULIE, MARC] }));

  it("liste un fil par coach, et ouvre celui du coach touché", () => {
    const { getByText, queryByText } = renderRn(<AthleteConversationsScreen />);

    expect(queryByText("Julie Renaud")).not.toBeNull();
    press(getByText("Marc Keller"));

    expect(router.push).toHaveBeenCalledWith("/messages/c-2");
    // La liste des athlètes est une lecture de coach : l'athlète n'a pas à la demander.
    expect(useAthletes).not.toHaveBeenCalled();
  });

  it("dit qu'il n'a pas de coach plutôt qu'une liste vide", () => {
    mockCoaches({ data: [] });
    const { queryByText } = renderRn(<AthleteConversationsScreen />);

    expect(queryByText("messages.noCoach.title")).not.toBeNull();
  });

  it("dit la panne plutôt que l'absence de coach", () => {
    mockCoaches({ data: undefined, isError: true });
    const { queryByText } = renderRn(<AthleteConversationsScreen />);

    expect(queryByText("messages.noCoach.title")).toBeNull();
    expect(queryByText("common.retry")).not.toBeNull();
  });
});

/**
 * Une notification n'apporte que le fil ; la route d'un fil attend l'interlocuteur. La liste fait
 * la traduction — sans quoi le message de Marc ouvrirait « le » fil, alors qu'il y en a deux.
 */
describe("ConversationsScreen — le fil notifié", () => {
  beforeEach(() => {
    mockCoaches({ data: [JULIE, MARC] });
    mockConversations({
      data: [
        conversation({ id: "conv-j", counterpartId: "c-1" }),
        conversation({ id: "conv-m", counterpartId: "c-2" }),
      ],
    });
  });

  it("ouvre le fil notifié, après avoir consommé le paramètre", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "conv-m" });
    renderRn(<AthleteConversationsScreen />);

    expect(router.setParams).toHaveBeenCalledWith({ conversation: undefined });
    expect(router.push).toHaveBeenCalledWith("/messages/c-2");
  });

  it("vaut aussi pour le coach, qui n'ouvrait jusque-là que sa liste", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "conv-2" });
    mockAthletes({ data: [LEA, SARAH] });
    mockConversations({ data: [conversation({ id: "conv-2", counterpartId: "a-2" })] });
    renderRn(<CoachConversationsScreen />);

    expect(router.push).toHaveBeenCalledWith("/messages/a-2");
  });

  // Un fil inconnu (coach quitté, notification périmée) ne fait rien deviner : la liste suffit.
  it("reste sur la liste quand le fil notifié n'y est pas", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "conv-inconnu" });
    renderRn(<AthleteConversationsScreen />);

    expect(router.push).not.toHaveBeenCalled();
  });
});

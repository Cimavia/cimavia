import { type ConversationDto, MessageType } from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useConversationCandidates,
  useConversations,
} from "@/feature/message/hook/useConversation";
import { MessagesScreen } from "@/feature/message/screen/MessagesScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que la liste DÉCIDE — une ligne par conversation (#612), ce qu'elle en montre, et ce
 * qu'elle dit quand il n'y en a aucune.
 */
vi.mock("@/feature/message/hook/useConversation", () => ({
  useConversations: vi.fn(),
  useConversationCandidates: vi.fn(),
}));
vi.mock("@/feature/notification/hook/useNotifications", () => ({
  useUnreadByCapability: () => ({ data: undefined }),
}));
// Le sélecteur d'espace lit la session et navigue : hors sujet ici, et il tirerait tout `expo-router`.
vi.mock("@/shared/component/CmvCapabilitySwitch", () => ({ CmvCapabilitySwitch: () => null }));
vi.mock("@/shared/hook/useExercisedCapability", () => ({ useActingCapability: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "me" } } }) },
}));

// Les données de la phase multi-coach : C et M (entreprise F), TE et TI — vues par TI.
function conversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: "cv-m",
    kind: "DIRECT",
    participants: [{ userId: "m", name: "Marc Morel", capability: "coach", lastReadAt: null }],
    lastReadAt: null,
    lastMessageAt: "2026-10-18T11:48:00.000Z",
    lastMessageSenderId: "m",
    lastMessageType: MessageType.TEXT,
    lastMessagePreview: "Je t'ai mis la mobilité en fin de séance.",
    unreadCount: 0,
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

const GROUP = conversation({
  id: "cv-cm",
  kind: "GROUP",
  participants: [
    { userId: "c", name: "Chloé Caron", capability: "coach", lastReadAt: null },
    { userId: "m", name: "Marc Morel", capability: "coach", lastReadAt: null },
  ],
  lastMessageSenderId: "me",
  lastMessagePreview: "Je fais la séance de grimpe demain ?",
});

const COACHES = {
  athletes: [],
  coaches: [
    { userId: "m", name: "Marc Morel", organizationNames: ["F"], followedAthleteIds: null },
  ],
};

const refetchConversations = vi.fn();
const refetchCandidates = vi.fn();

function mockConversations(state: Record<string, unknown>): void {
  vi.mocked(useConversations).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: refetchConversations,
    ...state,
  } as unknown as ReturnType<typeof useConversations>);
}

function mockCandidates(state: Record<string, unknown>): void {
  vi.mocked(useConversationCandidates).mockReturnValue({
    data: COACHES,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: refetchCandidates,
    ...state,
  } as unknown as ReturnType<typeof useConversationCandidates>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActingCapability).mockReturnValue("athlete");
  vi.mocked(useLocalSearchParams).mockReturnValue({});
  mockConversations({});
  mockCandidates({});
});

describe("MessagesScreen — la liste (#612)", () => {
  /**
   * #309 : le cache persisté est frais 5 min. Sans relecture à l'affichage, un message arrivé
   * pendant qu'on était sur un autre onglet n'allume sa pastille qu'au tirer-pour-rafraîchir.
   */
  it("relit les conversations à l'affichage", () => {
    renderRn(<MessagesScreen />);

    expect(refetchConversations).toHaveBeenCalledOnce();
  });

  it("rend une ligne par conversation, titrée de ses participants", () => {
    mockConversations({ data: [conversation(), GROUP] });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("Marc Morel")).not.toBeNull();
    expect(queryByText("Chloé Caron, Marc Morel")).not.toBeNull();
  });

  it("ouvre une conversation par son id", () => {
    mockConversations({ data: [GROUP] });
    const { getByText } = renderRn(<MessagesScreen />);

    press(getByText("Chloé Caron, Marc Morel"));

    expect(router.push).toHaveBeenCalledWith("/messages/cv-cm");
  });

  // « Vous : » sur mon dernier message, « M : » sur celui d'un autre à plusieurs ; rien à deux.
  it("préfixe l'aperçu de son auteur quand il faut le dire", () => {
    mockConversations({
      data: [
        GROUP,
        conversation({
          id: "cv-other",
          kind: "GROUP",
          participants: GROUP.participants,
          lastMessageSenderId: "c",
        }),
        conversation(),
      ],
    });
    const { queryByText, queryAllByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.previewSelf")).not.toBeNull();
    expect(queryByText("messages.previewAuthor")).not.toBeNull();
    expect(queryAllByText("Je t'ai mis la mobilité en fin de séance.")).toHaveLength(1);
  });

  it("dit le type d'un média sans texte", () => {
    mockConversations({
      data: [conversation({ lastMessageType: MessageType.AUDIO, lastMessagePreview: null })],
    });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.preview.AUDIO")).not.toBeNull();
  });

  // #598, E3 : une conversation tout juste créée n'a ni date ni aperçu — on n'en invente pas.
  it("rend « — » pour une conversation sans message", () => {
    mockConversations({
      data: [
        conversation({
          lastMessageAt: null,
          lastMessageSenderId: null,
          lastMessageType: null,
          lastMessagePreview: null,
        }),
      ],
    });
    const { queryAllByText } = renderRn(<MessagesScreen />);

    expect(queryAllByText("—")).toHaveLength(2);
  });

  it("montre le nombre de non-lus", () => {
    mockConversations({ data: [conversation({ unreadCount: 2 })] });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("2")).not.toBeNull();
  });
});

describe("MessagesScreen — nouvelle conversation (#612)", () => {
  it("mène à l'écran de création", () => {
    const { container } = renderRn(<MessagesScreen />);

    pressButton(container, "messages.newConversation");

    expect(router.push).toHaveBeenCalledWith("/messages/new");
  });

  it("ne la propose pas sans personne à réunir", () => {
    mockCandidates({ data: { athletes: [], coaches: [] } });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.newConversation")).toBeNull();
  });

  // Tant qu'on ne sait pas, pas de bouton qui mènerait à un sélecteur vide.
  it("ne la propose pas tant que les candidats chargent", () => {
    mockCandidates({ data: undefined, isPending: true });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.newConversation")).toBeNull();
  });
});

describe("MessagesScreen — à vide et en panne", () => {
  it("invite à la première conversation quand on a quelqu'un à réunir (E2)", () => {
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.noConversations.title")).not.toBeNull();
    expect(queryByText("messages.noConversations.athlete")).not.toBeNull();
  });

  // E1 : le chemin vers « Mes coachs » reste, seul accès aux invitations.
  it("renvoie l'athlète sans coach vers « Mes coachs » (E1)", () => {
    mockCandidates({ data: { athletes: [], coaches: [] } });
    const { container, queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.noCoach.title")).not.toBeNull();
    pressButton(container, "messages.noCoach.action");
    expect(router.push).toHaveBeenCalledWith("/join");
  });

  it("dit au Coach sans athlète ni collègue d'en inviter un", () => {
    vi.mocked(useActingCapability).mockReturnValue("coach");
    mockCandidates({ data: { athletes: [], coaches: [] } });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.noAthletes.title")).not.toBeNull();
  });

  // Trois états distincts, jamais confondus : le vide ne se dit pas sur une panne ni pendant le
  // chargement.
  it("dit la panne plutôt que le vide, et relance les deux lectures", () => {
    mockConversations({ data: undefined, isError: true });
    const { container, queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.noConversations.title")).toBeNull();
    pressButton(container, "common.retry");
    expect(refetchCandidates).toHaveBeenCalled();
    expect(refetchConversations).toHaveBeenCalledTimes(2);
  });

  it("ne dit pas le vide pendant le chargement", () => {
    mockConversations({ data: undefined, isPending: true });
    const { queryByText } = renderRn(<MessagesScreen />);

    expect(queryByText("messages.noConversations.title")).toBeNull();
  });
});

describe("MessagesScreen — depuis une notification", () => {
  // Le paramètre est consommé AVANT de naviguer : revenir du fil ne doit pas le rouvrir.
  it("ouvre la conversation notifiée, puis oublie le paramètre", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "cv-cm" });
    mockConversations({ data: [GROUP] });
    renderRn(<MessagesScreen />);

    expect(router.setParams).toHaveBeenCalledWith({ conversation: undefined });
    expect(router.push).toHaveBeenCalledWith("/messages/cv-cm");
  });

  // Sa présence se juge sur la liste relue : un cache ancien ne porte pas un fil tout juste ouvert.
  it("attend la relecture de la liste avant d'en juger", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "cv-cm" });
    mockConversations({ data: [], isFetching: true });
    renderRn(<MessagesScreen />);

    expect(router.setParams).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  // Notifiée à l'autre titre : le fil dirait une panne, la liste montre la pastille de l'espace.
  it("reste sur la liste quand elle ne porte pas la conversation notifiée", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ conversation: "cv-other" });
    mockConversations({ data: [GROUP] });
    renderRn(<MessagesScreen />);

    expect(router.setParams).toHaveBeenCalledWith({ conversation: undefined });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("n'ouvre rien sans conversation notifiée", () => {
    renderRn(<MessagesScreen />);

    expect(router.push).not.toHaveBeenCalled();
  });
});

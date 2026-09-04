import { type CoachAthleteDto, CoachAthleteStatus, SELF_RELATION_ID } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAthletes } from "@/feature/athlete";
import { useConversations } from "@/feature/message/hook/useConversation";
import { CoachConversationsScreen } from "@/feature/message/screen/CoachConversationsScreen";
import { renderRn } from "@/test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que la liste DÉCIDE — quelles lignes elle construit à partir des athlètes, et ce qu'elle
 * montre quand il n'en reste aucune.
 */
vi.mock("@/feature/athlete", () => ({ useAthletes: vi.fn() }));
vi.mock("@/feature/message/hook/useConversation", () => ({ useConversations: vi.fn() }));
vi.mock("@/feature/notification/hook/useNotifications", () => ({
  useUnreadByCapability: () => ({ data: undefined }),
}));
// Le sélecteur d'espace lit la session et navigue : hors sujet ici, et il tirerait tout `expo-router`.
vi.mock("@/shared/component/CmvCapabilitySwitch", () => ({ CmvCapabilitySwitch: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

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

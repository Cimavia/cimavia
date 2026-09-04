import { type CoachAthleteDto, CoachAthleteStatus, SELF_RELATION_ID } from "@cmv/shared";
import type { RenderResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { MessagesScreen } from "@/feature/message/screen/MessagesScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que la messagerie du coach DÉCIDE — quelles lignes elle construit à partir de la liste
 * d'athlètes, et ce qu'elle montre quand il n'en reste aucune.
 */
vi.mock("@/feature/athlete/hook/useAthletes", () => ({ useAthletes: vi.fn() }));
vi.mock("@/feature/message/hook/useMessages", () => ({
  useConversations: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useConversationWith: () => ({ data: { id: "c-1" }, isError: false, refetch: vi.fn() }),
  useMyConversation: () => ({ data: { id: "c-1" }, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/feature/coach", () => ({ useMyCoach: () => ({ data: null, isPending: false }) }));
// Le titre EXERCÉ décide de l'écran : ces tests portent tous sur la moitié coach.
vi.mock("@/shared/hook/useCapabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/hook/useCapabilities")>()),
  useActingCapability: () => "coach",
  useCapabilities: () => ({ isCoach: true, isAthlete: true, isPending: false }),
}));
vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "me", name: "Dual Curl" } } }),
    signOut: vi.fn(),
  },
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

function mockAthletes(data: CoachAthleteDto[]): void {
  vi.mocked(useAthletes).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAthletes>);
}

/**
 * Une ligne de fil est un `<button>` ; le nom du compte connecté vit AUSSI dans la barre latérale,
 * mais dans un `<Link>`. Interroger le rôle et non le texte est ce qui sépare les deux — sans quoi
 * « ne se montre pas à lui-même » passerait au vert en trouvant simplement le pied de la nav.
 */
const threadRow = (queryByRole: RenderResult["queryByRole"], name: string) =>
  queryByRole("button", { name: new RegExp(name) });

const open = () =>
  renderInRoute(<MessagesScreen />, {
    path: "/messages",
    links: ["/", "/library", "/plans", "/feedbacks", "/invoices", "/reminders", "/account"],
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MessagesScreen — côté coach", () => {
  it("liste un fil par athlète", async () => {
    mockAthletes([LEA]);
    const { queryByRole } = await open();

    expect(threadRow(queryByRole, "Léa Moreau")).not.toBeNull();
  });

  /**
   * Le cœur de #198 : le compte s'affichait comme son propre interlocuteur, en tête de liste, et
   * le sélectionner tombait sur un écran d'erreur — le fil `(soi, soi)` ne peut pas exister.
   */
  it("ne se montre pas à lui-même dans sa liste de fils", async () => {
    mockAthletes([SELF, LEA]);
    const { queryByRole } = await open();

    expect(threadRow(queryByRole, "Dual Curl")).toBeNull();
    expect(threadRow(queryByRole, "Léa Moreau")).not.toBeNull();
  });

  /**
   * Le cas le plus visible : un compte auto-coaché SANS athlète tiers. `rows` valait `[soi]`, donc
   * l'état vide n'était jamais rendu — une ligne morte le remplaçait.
   */
  it("dit le vide à un compte qui n'a que lui-même dans sa liste", async () => {
    mockAthletes([SELF]);
    const { queryByRole, queryByText } = await open();

    expect(queryByText("messages.noAthletes.title")).not.toBeNull();
    expect(threadRow(queryByRole, "Dual Curl")).toBeNull();
  });

  it("dit le vide quand aucun athlète n'a rejoint", async () => {
    mockAthletes([]);
    const { queryByText } = await open();

    expect(queryByText("messages.noAthletes.title")).not.toBeNull();
  });

  // Trois états distincts, jamais confondus : « aucun athlète » sur une panne réseau serait un
  // mensonge.
  it("dit la panne plutôt que le vide", async () => {
    vi.mocked(useAthletes).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAthletes>);
    const { queryByText } = await open();

    expect(queryByText("common.errorTitle")).not.toBeNull();
    expect(queryByText("messages.noAthletes.title")).toBeNull();
  });
});

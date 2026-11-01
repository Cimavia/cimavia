import type { ScheduledSessionDto } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { blockSession } from "@cmv/shared/test/block-session";
import type { UseQueryResult } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { SessionDetailScreen } from "@/feature/plan/screen/SessionDetailScreen";
import { press, pressButton, renderRn } from "@/test/render";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: vi.fn() }));
// Le bandeau hors-ligne écoute l'état réseau : hors sujet ici, et il n'a rien à dire d'un test.
// Le bandeau a SON test ; d'ici on ne vérifie que la date que l'écran lui passe.
vi.mock("@/shared/component/OfflineBanner", () => ({
  OfflineBanner: ({ savedAt }: Readonly<{ savedAt?: string | null }>) =>
    savedAt == null ? null : <span>{`offline-saved-at:${savedAt}`}</span>,
}));

const SESSION_ID = "ss-1";

function session(overrides: Partial<ScheduledSessionDto> = {}): ScheduledSessionDto {
  return {
    id: SESSION_ID,
    planId: "p-1",
    planWeekId: "pw-1",
    sourceSessionId: null,
    title: "Force haut du corps",
    notes: null,
    scheduledDate: "2026-10-13",
    position: 0,
    status: ScheduledSessionStatus.PLANNED,
    exerciseCount: overrides.exercises?.length ?? 0,
    blockCount: overrides.blocks?.length ?? 0,
    updatedAt: "2026-08-10T00:00:00.000Z",
    coachId: "coach_1",
    coachName: "Julie Renaud",
    exercises: [],
    blocks: [],
    ...overrides,
  };
}

/**
 * `useScheduledSession` rend un `useQuery` : l'écran en lit six champs, et les quatre états qu'il
 * distingue (chargement, erreur sèche, chargé, rafraîchissement) se jouent sur eux seuls.
 */
function query(state: Partial<UseQueryResult<ScheduledSessionDto>>) {
  vi.mocked(useScheduledSession).mockReturnValue({
    data: undefined,
    dataUpdatedAt: 0,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...state,
  } as UseQueryResult<ScheduledSessionDto>);
}

const loaded = (overrides: Partial<ScheduledSessionDto> = {}) =>
  query({ data: session(overrides) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: SESSION_ID });
});

describe("SessionDetailScreen", () => {
  /** #307 : hors-ligne, le bandeau date ce que l'athlète lit — l'arrivée de CETTE séance. */
  it("passe au bandeau hors-ligne l'instant où la séance a été récupérée", async () => {
    query({ data: session(), dataUpdatedAt: Date.parse("2026-08-12T19:04:00.000Z") });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("offline-saved-at:2026-08-12T19:04:00.000Z")).toBeTruthy();
  });

  /** Sans séance, aucune date à annoncer : le bandeau garde son message générique. */
  it("ne date rien tant que la séance n'est pas là", () => {
    query({ isPending: true, dataUpdatedAt: 0 });
    const { queryByText } = renderRn(<SessionDetailScreen />);

    expect(queryByText(/offline-saved-at/)).toBeNull();
  });

  /**
   * Le cœur de #276. Une séance sans exercice — un footing, du repos actif — se compose comme ça,
   * et le débrief y est le SEUL geste qui reste : c'est par lui que la trace part au coach. Rien
   * côté serveur n'y a jamais fait obstacle, la garde était purement cliente.
   */
  it("ouvre le débrief d'une séance sans exercice", async () => {
    loaded({ exercises: [] });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.open")).toBeTruthy();
  });

  it("mène au débrief de CETTE séance", async () => {
    loaded({ exercises: [] });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("feedback.open");

    pressButton(container, "feedback.open");

    expect(router.push).toHaveBeenCalledWith(`/session/${SESSION_ID}/feedback`);
  });

  // Le libellé suit le STATUT — « débriefer » sur une séance déjà débriefée laisserait croire
  // qu'on écrase. Jamais la composition : c'est l'erreur que #276 corrige.
  it("dit que le débrief existe déjà, même sans exercice", async () => {
    loaded({ exercises: [], status: ScheduledSessionStatus.DONE });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.openDone")).toBeTruthy();
  });

  /** #722 : une séance composée par blocs se lit bloc par bloc, plus exercice par exercice. */
  it("lit une séance par blocs bloc par bloc, et mène à l'écran d'un bloc", async () => {
    const { blocks, exercises } = blockSession();
    loaded({ blocks, exercises });
    const { findByText, getAllByLabelText, getAllByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("plan.blocks.count")).toBeTruthy();
    // La puce fait défiler l'écran : elle ne quitte pas la séance.
    press(getAllByText("Finisher")[0] as HTMLElement);
    expect(router.push).not.toHaveBeenCalled();
    press(getAllByLabelText("plan.blocks.open")[0] as HTMLElement);
    expect(router.push).toHaveBeenCalledWith(`/session/${SESSION_ID}/block/blk-1`);
  });

  // On constate le vide sans désigner de coupable, et sans rien retirer.
  it("constate l'absence de déroulé sans retirer le débrief", async () => {
    loaded({ exercises: [] });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("plan.session.emptyTitle")).toBeTruthy();
    expect(queryByText("feedback.open")).toBeTruthy();
  });

  it("ne constate aucun vide sur une séance qui a des blocs", async () => {
    const { blocks, exercises } = blockSession();
    loaded({ blocks, exercises });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("plan.blocks.count")).toBeTruthy();
    expect(queryByText("plan.session.emptyTitle")).toBeNull();
  });

  // Les consignes du coach sont NULLABLES : pas d'encart vide quand il n'y en a pas.
  it("montre les consignes du coach", async () => {
    loaded({ notes: "Échauffe les épaules." });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("Échauffe les épaules.")).toBeTruthy();
  });

  it("n'ouvre pas d'encart de consignes sur une séance qui n'en porte pas", async () => {
    loaded({ notes: null });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    await findByText("Force haut du corps");

    expect(queryByText("plan.session.notes")).toBeNull();
  });

  it("n'affirme rien tant que la séance charge", () => {
    query({ isPending: true });
    const { queryByText } = renderRn(<SessionDetailScreen />);

    expect(queryByText("feedback.open")).toBeNull();
    expect(queryByText("plan.session.emptyTitle")).toBeNull();
  });

  /**
   * Erreur SÈCHE — sans donnée en cache. Une erreur survenue sur un rafraîchissement laisse au
   * contraire la séance lisible : c'est ce que garde la condition `session == null`.
   */
  it("propose de reprendre quand la séance n'a pas pu être lue", async () => {
    const refetch = vi.fn();
    query({ isError: true, refetch: refetch as UseQueryResult<ScheduledSessionDto>["refetch"] });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("common.retry");

    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("se rafraîchit quand on tire la séance", async () => {
    const refetch = vi.fn();
    query({ data: session(), refetch });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("feedback.open");

    press(container.querySelector("[data-refresh]") as HTMLElement);

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("garde la séance lisible quand seul le rafraîchissement échoue", async () => {
    query({ data: session({ exercises: [] }), isError: true });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.open")).toBeTruthy();
    expect(queryByText("common.retry")).toBeNull();
  });
});

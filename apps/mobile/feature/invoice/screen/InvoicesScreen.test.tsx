import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
import { InvoicesScreen } from "@/feature/invoice/screen/InvoicesScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { pressButton, renderRn } from "@/test/render";

/**
 * Ce qui s'éprouve ici est ce que l'ÉCRAN décide : à quel titre on lit, laquelle des deux vues est
 * montée, et lequel des trois états (chargement, panne, vide) parle. Le contenu des vues a ses
 * propres tests.
 */

vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useInvoices: vi.fn(),
  useUpdateInvoiceStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelInvoice: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/feature/notification/hook/useNotifications", () => ({
  useUnreadByCapability: () => ({ data: undefined }),
}));
// Le sélecteur de casquette lit la session et navigue : hors sujet ici, et il tirerait `expo-router`.
vi.mock("@/shared/component/CmvCapabilitySwitch", () => ({ CmvCapabilitySwitch: () => null }));
vi.mock("@/shared/hook/useExercisedCapability", () => ({
  useActingCapability: vi.fn(),
  useExercisedCapability: () => null,
}));
vi.mock("@/shared/hook/useAthleteLabel", () => ({
  useAthleteLabel: () => (_id: string, name: string) => name,
}));
// `useFocusEffect` d'expo-router : le refetch au premier plan n'est pas le sujet de ces tests.
vi.mock("expo-router", () => ({ useFocusEffect: (fn: () => void) => fn() }));

function invoice(overrides: Partial<InvoiceDto> & { id: string }): InvoiceDto {
  return {
    coachId: "c-1",
    coachName: "Dual Curl",
    athleteId: "a-1",
    athleteName: "Léa Bonnet",
    planId: "p-1",
    planTitle: "Prépa bloc hiver",
    period: "2026-08",
    amountCents: 18_000,
    currency: "EUR",
    status: InvoiceStatus.PENDING,
    issuedAt: "2026-07-25T08:00:00.000Z",
    dueDate: "2026-08-05",
    paidAt: null,
    note: null,
    documentUrl: null,
    documentFileName: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    ...overrides,
  };
}

function mockInvoices(state: Record<string, unknown>): void {
  vi.mocked(useInvoices).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useInvoices>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActingCapability).mockReturnValue("coach");
  mockInvoices({});
});

describe("InvoicesScreen", () => {
  /**
   * Chargement, panne et vide sont TROIS états distincts. « Aucune facture émise » sur une panne
   * réseau serait un mensonge, et enverrait le coach diffuser un cycle qu'il a déjà diffusé.
   */
  it("ne dit pas « aucune facture » pendant le chargement", () => {
    mockInvoices({ isPending: true });
    renderRn(<InvoicesScreen />);

    expect(screen.queryByText("invoice.coach.empty.title")).toBeNull();
  });

  it("ne dit pas « aucune facture » sur une panne", () => {
    mockInvoices({ isError: true });
    renderRn(<InvoicesScreen />);

    expect(screen.queryByText("invoice.coach.empty.title")).toBeNull();
    expect(screen.getByText("common.errorTitle")).toBeTruthy();
  });

  /**
   * Le vide ne dit pas la même chose des deux côtés : au coach qu'il n'a rien émis (et où le
   * faire), à l'athlète qu'on ne lui demande rien.
   */
  it("annonce un vide différent selon le titre exercé", () => {
    mockInvoices({ data: [] });
    const { unmount } = renderRn(<InvoicesScreen />);
    expect(screen.getByText("invoice.coach.empty.title")).toBeTruthy();
    unmount();

    vi.mocked(useActingCapability).mockReturnValue("athlete");
    renderRn(<InvoicesScreen />);
    expect(screen.getByText("invoice.empty.title")).toBeTruthy();
  });

  // Rien d'émis : ni résumé à écrire, ni rien à filtrer.
  it("n'affiche ni résumé ni filtre quand rien n'est émis", () => {
    mockInvoices({ data: [] });
    renderRn(<InvoicesScreen />);

    expect(screen.queryByText("invoice.coach.summary.athletes")).toBeNull();
    expect(screen.queryByText("invoice.coach.situationFilter.ALL")).toBeNull();
  });

  it("donne au coach son résumé, son filtre et ses athlètes", () => {
    mockInvoices({ data: [invoice({ id: "i-1" })] });
    renderRn(<InvoicesScreen />);

    expect(screen.getByText("invoice.coach.title")).toBeTruthy();
    expect(screen.getByText(/invoice\.coach\.summary\.athletes/)).toBeTruthy();
    expect(screen.getByText("invoice.coach.situationFilter.ALL")).toBeTruthy();
    expect(screen.getByText("Léa Bonnet")).toBeTruthy();
  });

  /**
   * L'athlète garde sa liste À PLAT : il n'a qu'un coach, donc rien à grouper. Ni filtre, ni
   * groupement — sa carte porte le cycle facturé, pas un nom d'athlète.
   */
  it("garde la liste de l'athlète à plat, sans filtre", () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    mockInvoices({ data: [invoice({ id: "i-1" })] });
    renderRn(<InvoicesScreen />);

    expect(screen.getByText("Prépa bloc hiver")).toBeTruthy();
    expect(screen.queryByText("invoice.coach.situationFilter.ALL")).toBeNull();
    expect(screen.queryByText("Léa Bonnet")).toBeNull();
  });

  // Les deux titres ouvrent le MÊME détail, monté seulement quand une facture est ouverte.
  it("n'ouvre le détail qu'à la demande", () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    mockInvoices({ data: [invoice({ id: "i-1" })] });
    const { container } = renderRn(<InvoicesScreen />);

    expect(screen.queryByText("invoice.panel.dueDate")).toBeNull();

    pressButton(container, "Prépa bloc hiver");
    expect(screen.getByText("invoice.panel.dueDate")).toBeTruthy();
  });
});

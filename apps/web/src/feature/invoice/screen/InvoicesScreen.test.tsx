import { type InvoiceDto, InvoiceStatus, shiftIsoDate, todayIsoDate } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import {
  useCancelInvoice,
  useInvoices,
  useUpdateInvoiceStatus,
} from "@/feature/invoice/hook/useInvoices";
import { InvoicesScreen } from "@/feature/invoice/screen/InvoicesScreen";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { renderInRoute } from "../../../../test/render";

/**
 * Ce qui s'éprouve ici est ce que l'ÉCRAN décide : qui voit un tableau et qui voit des cartes, ce
 * que dit son sous-titre, et sur quelle facture les gestes du panneau retombent. Les dérivations
 * (situation, montant dû, ordre) ont leurs tests dans `@cmv/shared`, le panneau les siens.
 */
vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useInvoices: vi.fn(),
  useUpdateInvoiceStatus: vi.fn(),
  useCancelInvoice: vi.fn(),
}));
vi.mock("@/shared/hook/useCapabilities", () => ({ useActingCapability: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "usr_coach" } } }) },
}));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    subtitle,
    children,
  }: Readonly<{ title: string; subtitle?: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children as never}
    </div>
  ),
}));

/**
 * Les échéances sont relatives à AUJOURD'HUI : « en retard » est un état dérivé de la date du
 * jour, et des dates en dur feraient basculer la suite au fil du calendrier — un rouge sans
 * qu'aucune régression n'ait eu lieu.
 */
const daysAgo = (days: number) => shiftIsoDate(todayIsoDate(), -days) ?? todayIsoDate();
const inDays = (days: number) => shiftIsoDate(todayIsoDate(), days) ?? todayIsoDate();

function invoice(over: Partial<InvoiceDto> & Pick<InvoiceDto, "id">): InvoiceDto {
  return {
    coachId: "usr_coach",
    coachName: "Marc Keller",
    athleteId: "usr_lea",
    athleteName: "Léa Bonnet",
    planId: "pln_1",
    planTitle: "Prépa bloc hiver",
    period: "2026-08",
    amountCents: 18000,
    currency: "EUR",
    status: InvoiceStatus.PENDING,
    issuedAt: "2026-07-01T09:00:00Z",
    dueDate: inDays(30),
    paidAt: null,
    note: null,
    documentUrl: null,
    documentFileName: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    ...over,
  };
}

// Léa : deux retards, dont un de 68 jours. Théo : un retard plus récent. Adrien : tout réglé.
const LEA_OVERDUE = invoice({ id: "inv_lea_1", period: "2026-06", dueDate: daysAgo(68) });
const LEA_OVERDUE_2 = invoice({ id: "inv_lea_2", period: "2026-07", dueDate: daysAgo(20) });
const LEA_PAID = invoice({
  id: "inv_lea_3",
  period: "2026-05",
  status: InvoiceStatus.PAID,
  paidAt: "2026-05-04T09:00:00Z",
});
const THEO_OVERDUE = invoice({
  id: "inv_theo",
  athleteId: "usr_theo",
  athleteName: "Théo Marchand",
  dueDate: daysAgo(12),
});
const ADRIEN_PAID = invoice({
  id: "inv_adrien",
  athleteId: "usr_adrien",
  athleteName: "Adrien Roux",
  status: InvoiceStatus.PAID,
  paidAt: "2026-08-02T09:00:00Z",
});

const ALL = [LEA_OVERDUE, LEA_OVERDUE_2, LEA_PAID, THEO_OVERDUE, ADRIEN_PAID];

type QueryState = { data?: InvoiceDto[]; isPending?: boolean; isError?: boolean };

async function setup(
  state: QueryState = { data: ALL },
  capability = "coach",
  search: Record<string, string> = {},
) {
  const mutate = vi.fn();
  const cancelMutate = vi.fn();
  const refetch = vi.fn();
  vi.mocked(useInvoices).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    refetch,
  } as unknown as ReturnType<typeof useInvoices>);
  vi.mocked(useUpdateInvoiceStatus).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInvoiceStatus>);
  vi.mocked(useCancelInvoice).mockReturnValue({
    mutate: cancelMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelInvoice>);
  vi.mocked(useActingCapability).mockReturnValue(
    capability as ReturnType<typeof useActingCapability>,
  );

  const rendered = await renderInRoute(<InvoicesScreen />, { path: "/invoices", search });
  return { ...rendered, mutate, cancelMutate, refetch };
}

describe("InvoicesScreen — coach", () => {
  it("liste un athlète par ligne, les retards les plus anciens d'abord", async () => {
    const { getAllByRole } = await setup();

    const names = getAllByRole("button", { expanded: false }).map((row) => row.textContent);
    expect(names?.[0]).toContain("Léa Bonnet");
    expect(names?.[1]).toContain("Théo Marchand");
    expect(names?.[2]).toContain("Adrien Roux");
  });

  it("résume en tête combien d'athlètes sont facturés et combien sont en retard", async () => {
    const { getByText } = await setup();
    // En cimode les clés sont rendues telles quelles, décomptes perdus : ce qui s'affirme est la
    // COMPOSITION du sous-titre, pas sa mise en forme.
    expect(getByText("invoice.summary.athletes · invoice.summary.overdue")).toBeTruthy();
  });

  it("tait la clause des retards quand il n'y en a aucun", async () => {
    const { getByText } = await setup({ data: [ADRIEN_PAID] });
    expect(getByText("invoice.summary.athletes")).toBeTruthy();
  });

  it("déplie l'historique d'un athlète, puis le referme", async () => {
    const { user, getByRole, queryByText } = await setup();

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    // Sa facture réglée n'est visible que dépliée.
    expect(queryByText("invoice.history.paidOn")).toBeTruthy();

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    expect(queryByText("invoice.history.paidOn")).toBeNull();
  });

  it("n'ouvre qu'un seul historique à la fois", async () => {
    const { user, getByRole } = await setup();

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    await user.click(getByRole("button", { name: /Théo Marchand/ }));

    expect(getByRole("button", { name: /Léa Bonnet/ })).toHaveAttribute("aria-expanded", "false");
    expect(getByRole("button", { name: /Théo Marchand/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("ouvre le panneau depuis une facture de l'historique, et agit sur elle", async () => {
    const { user, getByRole, getAllByRole, mutate } = await setup();

    await user.click(getByRole("button", { name: /Théo Marchand/ }));
    // La seule ligne de son historique.
    const [line] = getAllByRole("button").filter((node) =>
      node.textContent?.includes("invoice.history.overdueOn"),
    );
    await user.click(line as HTMLElement);

    await user.click(getByRole("button", { name: "invoice.markPaid" }));
    expect(mutate).toHaveBeenCalledWith({ id: "inv_theo", status: InvoiceStatus.PAID });
  });

  it("referme le panneau sans rien changer à la facture", async () => {
    const { user, getByRole, getAllByRole, queryByRole, mutate, cancelMutate } = await setup();

    await user.click(getByRole("button", { name: /Théo Marchand/ }));
    const [line] = getAllByRole("button").filter((node) =>
      node.textContent?.includes("invoice.history.overdueOn"),
    );
    await user.click(line as HTMLElement);
    await user.click(getByRole("button", { name: "Fermer" }));

    expect(queryByRole("complementary")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it("annule la facture ouverte, une fois la confirmation donnée", async () => {
    const { user, getByRole, getAllByRole, cancelMutate } = await setup();

    await user.click(getByRole("button", { name: /Théo Marchand/ }));
    const [line] = getAllByRole("button").filter((node) =>
      node.textContent?.includes("invoice.history.overdueOn"),
    );
    await user.click(line as HTMLElement);

    await user.click(getByRole("button", { name: "invoice.cancel" }));
    await user.click(getByRole("button", { name: "invoice.cancelConfirm" }));

    expect(cancelMutate).toHaveBeenCalledWith("inv_theo");
  });

  it("ne retient que la situation demandée, et le dit quand il n'en reste aucune", async () => {
    const { user, getByRole, queryByRole, getByText } = await setup();

    await user.click(getByRole("button", { name: /invoice.situationFilter.UP_TO_DATE/ }));
    expect(getByRole("button", { name: /Adrien Roux/ })).toBeTruthy();
    expect(queryByRole("button", { name: /Léa Bonnet/ })).toBeNull();

    await user.click(getByRole("button", { name: /invoice.situationFilter.DUE/ }));
    // « Aucun athlète ne correspond » et non « aucune facture émise » : les confondre enverrait
    // le coach chercher un cycle à diffuser au lieu de vider son filtre.
    expect(getByText("invoice.noMatch.title")).toBeTruthy();
  });

  it("cherche un athlète par son nom, sans casse ni accent", async () => {
    const { user, getByRole, queryByRole } = await setup();

    await user.type(getByRole("searchbox", { name: "invoice.searchLabel" }), "theo");

    expect(getByRole("button", { name: /Théo Marchand/ })).toBeTruthy();
    expect(queryByRole("button", { name: /Léa Bonnet/ })).toBeNull();
  });

  it("arrive filtré et déplié depuis l'url, comme un signet ou un rechargement", async () => {
    const { getByRole, queryByRole } = await setup({ data: ALL }, "coach", {
      situation: "OVERDUE",
      athlete: "usr_theo",
    });

    expect(getByRole("button", { name: /Théo Marchand/ })).toHaveAttribute("aria-expanded", "true");
    expect(queryByRole("button", { name: /Adrien Roux/ })).toBeNull();
  });
});

describe("InvoicesScreen — athlète", () => {
  it("garde ses cartes, sans tableau ni barre de situation", async () => {
    const { getByRole, queryByRole } = await setup({ data: [LEA_OVERDUE] }, "athlete");

    expect(queryByRole("searchbox")).toBeNull();
    expect(getByRole("button", { name: /invoice.byCoach/ })).toBeTruthy();
  });

  it("ouvre le panneau en lecture, sans aucun geste", async () => {
    const { user, getByRole, queryByRole } = await setup({ data: [LEA_OVERDUE] }, "athlete");

    await user.click(getByRole("button", { name: /invoice.byCoach/ }));

    expect(getByRole("complementary")).toBeTruthy();
    expect(queryByRole("button", { name: "invoice.markPaid" })).toBeNull();
    expect(queryByRole("button", { name: "invoice.cancel" })).toBeNull();
  });
});

describe("InvoicesScreen — états", () => {
  it("distingue le vide, l'erreur et le chargement", async () => {
    const empty = await setup({ data: [] });
    expect(empty.getByText("invoice.empty.title")).toBeTruthy();
    empty.unmount();

    const errored = await setup({ isError: true });
    expect(errored.getByText("common.errorTitle")).toBeTruthy();
    errored.unmount();

    // « Aucune facture » pendant le chargement serait un mensonge : trois états, trois rendus.
    const loading = await setup({ isPending: true });
    expect(loading.getByText("common.loading")).toBeTruthy();
    expect(loading.queryByText("invoice.empty.title")).toBeNull();
  });

  it("relance la requête depuis l'état d'erreur", async () => {
    const { user, getByRole, refetch } = await setup({ isError: true });

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("rouvre, en deux temps, une facture marquée payée à tort", async () => {
    const { user, getByRole, getAllByRole, mutate } = await setup({ data: [ADRIEN_PAID] });

    await user.click(getByRole("button", { name: /Adrien Roux/ }));
    const [line] = getAllByRole("button").filter((node) =>
      node.textContent?.includes("invoice.history.paidOn"),
    );
    await user.click(line as HTMLElement);

    await user.click(getByRole("button", { name: "invoice.reopen" }));
    expect(mutate).not.toHaveBeenCalled();
    await user.click(getByRole("button", { name: "invoice.reopenConfirm" }));

    expect(mutate).toHaveBeenCalledWith({ id: "inv_adrien", status: InvoiceStatus.PENDING });
  });
});

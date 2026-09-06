import {
  buildInvoiceAthleteRows,
  type InvoiceAthleteRow,
  type InvoiceDto,
  InvoiceStatus,
} from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoachInvoiceList } from "@/feature/invoice/component/CoachInvoiceList";
import { pressButton, renderRn } from "@/test/render";

// « (moi) » lit la session : hors sujet ici, et il tirerait tout le contexte d'authentification.
vi.mock("@/shared/hook/useAthleteLabel", () => ({
  useAthleteLabel: () => (_id: string, name: string) => name,
}));

/**
 * Ce qui s'éprouve ici est ce que la liste DÉCIDE : un seul athlète déplié à la fois, ce qu'elle
 * dit quand le filtre ne ramène personne, et le fait qu'une facture d'historique mène au détail.
 */

function invoice(overrides: Partial<InvoiceDto>): InvoiceDto {
  return {
    id: "inv-1",
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

function rowsOf(invoices: InvoiceDto[]): InvoiceAthleteRow<InvoiceDto>[] {
  // La construction vient de `@cmv/shared` : la liste doit rendre CE qu'elle en reçoit.
  return buildInvoiceAthleteRows(invoices, "2026-09-06") ?? [];
}

function setup(rows: InvoiceAthleteRow<InvoiceDto>[]) {
  const onOpenInvoice = vi.fn();
  const { baseElement } = renderRn(<CoachInvoiceList rows={rows} onOpenInvoice={onOpenInvoice} />);
  return { onOpenInvoice, baseElement };
}

const LEA = invoice({ id: "i-1", athleteId: "a-1", athleteName: "Léa Bonnet" });
const LEA_JUILLET = invoice({
  id: "i-2",
  athleteId: "a-1",
  athleteName: "Léa Bonnet",
  period: "2026-07",
  dueDate: "2026-07-05",
});
const SARAH = invoice({ id: "i-3", athleteId: "a-2", athleteName: "Sarah Nguyen" });

describe("CoachInvoiceList", () => {
  /**
   * « Aucun athlète ne correspond » n'est PAS « aucune facture émise ». Les confondre enverrait le
   * coach chercher un cycle à diffuser alors qu'il lui suffit de revenir à « Tous ».
   */
  it("distingue le filtre sans résultat de l'absence de facture", () => {
    setup([]);

    expect(screen.getByText("invoice.coach.noMatch.title")).toBeTruthy();
  });

  // Replié, l'historique n'existe pas : la liste répond à « qui », pas à « quelles factures ».
  it("n'affiche aucun historique tant que rien n'est déplié", () => {
    setup(rowsOf([LEA, LEA_JUILLET]));

    expect(screen.getByText("Léa Bonnet")).toBeTruthy();
    expect(screen.queryByText("août 2026")).toBeNull();
  });

  it("déplie l'historique de l'athlète touché, et le referme au second appui", () => {
    const { baseElement } = setup(rowsOf([LEA, LEA_JUILLET]));

    pressButton(baseElement, "Léa Bonnet");
    expect(screen.getByText("août 2026")).toBeTruthy();

    pressButton(baseElement, "Léa Bonnet");
    expect(screen.queryByText("août 2026")).toBeNull();
  });

  /**
   * UN SEUL déplié à la fois : la question posée à cet écran est « qui me doit quelque chose », et
   * tout ouvrir la reposerait à zéro.
   */
  it("referme l'athlète précédent quand un autre s'ouvre", () => {
    const { baseElement } = setup(rowsOf([LEA, SARAH]));

    pressButton(baseElement, "Léa Bonnet");
    expect(screen.getByText("août 2026")).toBeTruthy();

    pressButton(baseElement, "Sarah Nguyen");
    // Une seule facture d'historique rendue : celle de Sarah, pas les deux.
    expect(screen.getAllByText("août 2026")).toHaveLength(1);
  });

  it("mène au détail depuis une facture de l'historique", () => {
    const { onOpenInvoice, baseElement } = setup(rowsOf([LEA]));

    pressButton(baseElement, "Léa Bonnet");
    pressButton(baseElement, "août 2026");
    expect(onOpenInvoice).toHaveBeenCalledWith("i-1");
  });
});

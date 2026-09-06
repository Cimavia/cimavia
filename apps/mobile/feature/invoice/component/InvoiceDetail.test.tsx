import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetail } from "@/feature/invoice/component/InvoiceDetail";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";
import { pressButton, renderRn } from "@/test/render";

// Les mutations ont leurs propres tests : ce qui s'éprouve ici est CE QUI les déclenche.
vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useUpdateInvoiceStatus: vi.fn(),
  useCancelInvoice: vi.fn(),
}));

const setStatus = vi.fn();
const cancelInvoice = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useUpdateInvoiceStatus).mockReturnValue({
    mutate: setStatus,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInvoiceStatus>);
  vi.mocked(useCancelInvoice).mockReturnValue({
    mutate: cancelInvoice,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelInvoice>);
});

/**
 * Ce qui s'éprouve ici est ce que le détail DÉCIDE : quelles lignes existent selon l'état de la
 * facture, et quels gestes sont offerts à qui. Les libellés sont rendus en clé (`cimode`), donc
 * aucune assertion ne dépend d'un mot du catalogue.
 */

function invoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
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

/**
 * `baseElement` et non `container` : `Modal` (react-native-web) rend dans un PORTAIL, accroché au
 * `body` et non sous la racine du rendu. Interroger `container` ne trouverait rien — un `<div />`
 * vide — et le test passerait à côté de tout ce qu'il croit presser.
 */
function setup(dto: InvoiceDto, canManage = true) {
  const { baseElement } = renderRn(
    <InvoiceDetail invoice={dto} canManage={canManage} onClose={vi.fn()} />,
  );
  return { baseElement };
}

describe("InvoiceDetail", () => {
  /**
   * `paidAt` est null tant qu'impayée : la ligne doit DISPARAÎTRE. Un « — » à sa place annoncerait
   * un règlement introuvable, ce qui est pire que de ne rien dire.
   */
  it("n'écrit pas de ligne de paiement sur une facture impayée", () => {
    setup(invoice());

    expect(screen.getByText("invoice.panel.dueDate")).toBeTruthy();
    expect(screen.queryByText("invoice.panel.paidAt")).toBeNull();
  });

  // Note et justificatif sont optionnels au DTO : absents, leurs lignes n'existent pas.
  it("n'écrit ni note ni justificatif quand la facture n'en a pas", () => {
    setup(invoice());

    expect(screen.queryByText("invoice.panel.note")).toBeNull();
    expect(screen.queryByText("invoice.panel.document")).toBeNull();
  });

  it("écrit la note et le justificatif quand ils existent", () => {
    setup(
      invoice({
        note: "Tarif ajusté.",
        documentUrl: "https://s3/x.pdf",
        documentFileName: "x.pdf",
      }),
    );

    expect(screen.getByText("invoice.panel.note")).toBeTruthy();
    expect(screen.getByText("invoice.panel.document")).toBeTruthy();
  });

  // Impayée : le coach déclare le règlement, et peut se poser un rappel. Pas de retour arrière —
  // il n'y a rien à défaire.
  it("offre au coach de marquer payée, de se poser un rappel et d'annuler", () => {
    const { baseElement } = setup(invoice());

    expect(screen.getByText("reminder.schedule")).toBeTruthy();
    expect(screen.getByText("invoice.coach.cancel")).toBeTruthy();
    pressButton(baseElement, "invoice.coach.markPaid");
    expect(setStatus).toHaveBeenCalledWith({ id: "inv-1", status: InvoiceStatus.PAID });
  });

  /**
   * L'annulation est TERMINALE — l'API refuse ensuite tout retour en 409 —, et c'est ce que
   * l'avertissement dit, au dernier moment où il peut servir. Un appui unique la poserait sur un
   * effleurement, sans rien à défaire derrière.
   */
  it("protège l'annulation et n'avertit qu'une fois armée", () => {
    const { baseElement } = setup(invoice());

    expect(screen.queryByText("invoice.coach.cancelHint")).toBeNull();

    pressButton(baseElement, "invoice.coach.cancel");
    expect(cancelInvoice).not.toHaveBeenCalled();
    expect(screen.getByText("invoice.coach.cancelHint")).toBeTruthy();

    pressButton(baseElement, "invoice.coach.cancelConfirm");
    // L'endpoint DÉDIÉ, jamais le toggle de statut : `CANCELLED` ouvert au toggle contournerait la
    // garde qui l'interdit depuis autre chose que `PENDING`.
    expect(cancelInvoice).toHaveBeenCalledWith("inv-1");
    expect(setStatus).not.toHaveBeenCalled();
  });

  /**
   * Payée : plus rien à annuler. L'API le refuserait (l'annulation part de `PENDING` seulement) —
   * offrir le bouton mènerait à une erreur pour un geste qui n'a jamais été possible.
   */
  it("n'offre pas d'annuler une facture déjà payée", () => {
    setup(invoice({ status: InvoiceStatus.PAID, paidAt: "2026-08-02T09:00:00.000Z" }));

    expect(screen.queryByText("invoice.coach.cancel")).toBeNull();
  });

  /**
   * Payée : un seul geste, et il se confirme. Un appui unique qui rouvrirait la facture effacerait
   * `paidAt` — l'API le remet à null — sur un simple effleurement.
   */
  it("protège le retour arrière d'une facture payée", () => {
    const paid = invoice({ status: InvoiceStatus.PAID, paidAt: "2026-08-02T09:00:00.000Z" });
    const { baseElement } = setup(paid);

    expect(screen.getByText("invoice.panel.paidAt")).toBeTruthy();
    expect(screen.queryByText("invoice.coach.markPaid")).toBeNull();

    pressButton(baseElement, "invoice.coach.reopen");
    expect(setStatus).not.toHaveBeenCalled();

    pressButton(baseElement, "invoice.coach.reopenConfirm");
    expect(setStatus).toHaveBeenCalledWith({ id: "inv-1", status: InvoiceStatus.PENDING });
  });

  /**
   * Annulée = terminal : l'API refuse tout retour (409). Un pied vide vaut mieux qu'un bouton
   * éteint, qui laisse chercher ce qui le rallumerait.
   */
  it("n'offre aucun geste sur une facture annulée", () => {
    setup(invoice({ status: InvoiceStatus.CANCELLED }));

    expect(screen.queryByText("invoice.coach.markPaid")).toBeNull();
    expect(screen.queryByText("invoice.coach.reopen")).toBeNull();
    expect(screen.queryByText("invoice.coach.cancel")).toBeNull();
    expect(screen.queryByText("reminder.schedule")).toBeNull();
  });

  /**
   * L'athlète LIT la même facture et n'agit sur aucune. Ce n'est pas de la politesse : la route de
   * statut est gardée `@Roles([COACH])`, et le rappel touche `Reminder`, scopée `coachId` seul —
   * un athlète qui l'atteindrait prendrait une erreur, pas un 403.
   */
  it("ne donne aucun geste à l'athlète", () => {
    setup(invoice(), false);

    expect(screen.getByText("invoice.panel.dueDate")).toBeTruthy();
    expect(screen.queryByText("invoice.coach.markPaid")).toBeNull();
    expect(screen.queryByText("invoice.coach.cancel")).toBeNull();
    expect(screen.queryByText("reminder.schedule")).toBeNull();
  });
});

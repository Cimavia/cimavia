import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { InvoiceDetailPanel } from "./InvoiceDetailPanel";

const OVERDUE: InvoiceDto = {
  id: "inv_1",
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
  // Largement dépassée : l'état dérivé se calcule sur la date du jour, quelle qu'elle soit.
  dueDate: "2020-08-05",
  paidAt: null,
  note: "Tarif ajusté : deux séances reportées.",
  documentUrl: null,
  documentFileName: null,
  createdAt: "2026-07-01T09:00:00Z",
  updatedAt: "2026-07-01T09:00:00Z",
};

const PAID: InvoiceDto = {
  ...OVERDUE,
  id: "inv_2",
  status: InvoiceStatus.PAID,
  paidAt: "2026-08-02T09:00:00Z",
  documentUrl: "https://storage.example/inv_2.pdf?sig=x",
  documentFileName: "facture-aout-2026.pdf",
};

const CANCELLED: InvoiceDto = { ...OVERDUE, id: "inv_3", status: InvoiceStatus.CANCELLED };

function setup(invoice: InvoiceDto | null, canManage = true) {
  const handlers = {
    onClose: vi.fn(),
    onMarkPaid: vi.fn(),
    onReopen: vi.fn(),
    onCancel: vi.fn(),
  };
  return {
    ...renderWithProviders(
      <InvoiceDetailPanel invoice={invoice} canManage={canManage} busy={false} {...handlers} />,
    ),
    ...handlers,
  };
}

describe("InvoiceDetailPanel", () => {
  it("ne rend rien sans facture ouverte", () => {
    const { queryByRole } = setup(null);
    expect(queryByRole("complementary")).toBeNull();
  });

  it("titre le panneau de l'athlète et de la période, côté coach", () => {
    const { getByRole } = setup(OVERDUE);
    expect(getByRole("complementary", { name: "Léa Bonnet · août 2026" })).toBeTruthy();
  });

  it("titre le panneau du COACH côté athlète, qui n'a pas à lire son propre nom", () => {
    const { getByRole } = setup(OVERDUE, false);
    // `invoice.byCoach` interpole le nom du coach ; en cimode la clé est rendue telle quelle.
    expect(getByRole("complementary", { name: "invoice.byCoach · août 2026" })).toBeTruthy();
  });

  it("montre l'échéance, le cycle et la note", () => {
    const { getByText } = setup(OVERDUE);
    expect(getByText("invoice.panel.dueDate")).toBeTruthy();
    expect(getByText("invoice.panel.plan")).toBeTruthy();
    expect(getByText("Prépa bloc hiver")).toBeTruthy();
    expect(getByText("invoice.panel.note")).toBeTruthy();
    expect(getByText("Tarif ajusté : deux séances reportées.")).toBeTruthy();
  });

  it("n'affiche ni ligne de paiement ni justificatif quand il n'y en a pas", () => {
    const { queryByText, queryByRole } = setup(OVERDUE);
    // `paidAt` null : la ligne DISPARAÎT, plutôt qu'un « — » annonçant un règlement introuvable.
    expect(queryByText("invoice.panel.paidAt")).toBeNull();
    expect(queryByText("invoice.panel.document")).toBeNull();
    expect(queryByRole("button", { name: "invoice.viewDocument" })).toBeNull();
  });

  it("montre la date de règlement et le justificatif d'une facture payée", () => {
    const { getByText, getByRole } = setup(PAID);
    expect(getByText("invoice.panel.paidAt")).toBeTruthy();
    expect(getByRole("button", { name: "invoice.viewDocument" })).toBeTruthy();
    // Le nom d'origine accompagne le bouton : c'est lui que le coach reconnaît.
    expect(getByText("facture-aout-2026.pdf")).toBeTruthy();
  });

  it("ouvre le justificatif dans un onglet, sur l'url signée servie avec la facture", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user, getByRole } = setup(PAID);

    await user.click(getByRole("button", { name: "invoice.viewDocument" }));

    // `noopener` : l'onglet ouvert ne doit pas garder la main sur celui qui l'ouvre.
    expect(open).toHaveBeenCalledWith(PAID.documentUrl, "_blank", "noopener");
    open.mockRestore();
  });

  it("offre au coach les trois gestes d'une facture impayée", () => {
    const { getByRole } = setup(OVERDUE);
    expect(getByRole("button", { name: "invoice.markPaid" })).toBeTruthy();
    expect(getByRole("button", { name: "reminder.schedule" })).toBeTruthy();
    expect(getByRole("button", { name: "invoice.cancel" })).toBeTruthy();
  });

  it("marque payée depuis le panneau", async () => {
    const { user, getByRole, onMarkPaid } = setup(OVERDUE);
    await user.click(getByRole("button", { name: "invoice.markPaid" }));
    expect(onMarkPaid).toHaveBeenCalledOnce();
  });

  it("n'offre que le retour arrière sur une facture payée", () => {
    const { getByRole, queryByRole } = setup(PAID);
    expect(getByRole("button", { name: "invoice.reopen" })).toBeTruthy();
    expect(queryByRole("button", { name: "invoice.markPaid" })).toBeNull();
    // Se rappeler de relancer une facture réglée n'a aucun sens.
    expect(queryByRole("button", { name: "reminder.schedule" })).toBeNull();
    expect(queryByRole("button", { name: "invoice.cancel" })).toBeNull();
  });

  it("ne propose plus rien sur une facture annulée, et barre son montant", () => {
    const { queryByRole, getByText } = setup(CANCELLED);
    expect(queryByRole("button", { name: "invoice.markPaid" })).toBeNull();
    expect(queryByRole("button", { name: "invoice.reopen" })).toBeNull();
    expect(queryByRole("button", { name: "invoice.cancel" })).toBeNull();
    // Un état terminal (409 sur tout retour) : le montant barré dit que plus personne ne doit rien.
    expect(getByText("180,00 €").className).toContain("line-through");
  });

  it("ne propose aucun geste à l'athlète, qui garde sa lecture et son PDF", () => {
    const { queryByRole, getByRole } = setup(PAID, false);
    expect(queryByRole("button", { name: "invoice.reopen" })).toBeNull();
    expect(getByRole("button", { name: "invoice.viewDocument" })).toBeTruthy();
  });

  it("annule en deux temps, en disant d'abord ce que la confirmation engage", async () => {
    const { user, getByRole, getByText, queryByText, onCancel } = setup(OVERDUE);

    // Au repos, rien à avertir.
    expect(queryByText("invoice.cancelHint")).toBeNull();

    await user.click(getByRole("button", { name: "invoice.cancel" }));
    expect(getByText("invoice.cancelHint")).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(getByRole("button", { name: "invoice.cancelConfirm" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("désarme l'annulation si on se ravise, sans rien avoir annulé", async () => {
    const { user, getByRole, queryByText, onCancel } = setup(OVERDUE);

    await user.click(getByRole("button", { name: "invoice.cancel" }));
    await user.click(getByRole("button", { name: "common.cancel" }));

    expect(queryByText("invoice.cancelHint")).toBeNull();
    expect(getByRole("button", { name: "invoice.cancel" })).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("éteint les gestes pendant qu'une mutation est en vol", () => {
    const { getByRole } = renderWithProviders(
      <InvoiceDetailPanel
        invoice={OVERDUE}
        canManage
        busy
        onClose={vi.fn()}
        onMarkPaid={vi.fn()}
        onReopen={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(getByRole("button", { name: "invoice.markPaid" })).toBeDisabled();
    expect(getByRole("button", { name: "invoice.cancel" })).toBeDisabled();
  });
});

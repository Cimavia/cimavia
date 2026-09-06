import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInvoiceRows } from "@/feature/invoice/hook/useInvoiceRows";

/**
 * La dérivation est mesurée dans `@cmv/shared` ; ce qui s'éprouve ici est ce que le hook AJOUTE :
 * il tient un filtre, il compte sur les lignes NON filtrées, et il ne cherche rien par nom.
 */

// Le « aujourd'hui » est figé : sans ça, « en retard » dépendrait du jour où le test tourne.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T10:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

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

/** Échue le 5 août, non réglée : en retard au 6 septembre. */
const LEA = invoice({ id: "i-1", athleteId: "a-1", athleteName: "Léa Bonnet" });
/** Échéance à venir : due, mais pas en retard. */
const SARAH = invoice({
  id: "i-2",
  athleteId: "a-2",
  athleteName: "Sarah Nguyen",
  dueDate: "2026-10-25",
});
/** Réglée : à jour, et ne doit rien. */
const ADRIEN = invoice({
  id: "i-3",
  athleteId: "a-3",
  athleteName: "Adrien Roux",
  status: InvoiceStatus.PAID,
  paidAt: "2026-08-02T09:00:00.000Z",
});

describe("useInvoiceRows", () => {
  /**
   * Liste absente (chargement, panne) → `null`, et non un tableau vide qui annoncerait « aucune
   * facture ». C'est l'écran d'erreur qui doit parler, pas l'état vide.
   */
  it("ne fabrique aucune ligne tant que la liste n'a pas répondu", () => {
    const { result } = renderHook(() => useInvoiceRows(undefined));

    expect(result.current.rows).toBeNull();
    expect(result.current.visible).toEqual([]);
  });

  it("groupe par athlète et range les retards en tête", () => {
    const { result } = renderHook(() => useInvoiceRows([ADRIEN, SARAH, LEA]));

    expect(result.current.visible.map((row) => row.athleteName)).toEqual([
      "Léa Bonnet",
      "Sarah Nguyen",
      "Adrien Roux",
    ]);
  });

  it("ne retient que la situation choisie", () => {
    const { result } = renderHook(() => useInvoiceRows([ADRIEN, SARAH, LEA]));

    act(() => result.current.setFilter("OVERDUE"));
    expect(result.current.visible.map((row) => row.athleteName)).toEqual(["Léa Bonnet"]);
  });

  /**
   * Les décomptes se comptent sur les lignes NON filtrées : un segment annonce ce qu'il CONTIENT,
   * pas ce qui reste après le filtre en cours. Sinon « À jour 1 » tomberait à zéro dès qu'on
   * regarde les retards, et le coach ne saurait plus où revenir.
   */
  it("compte les segments sur toutes les lignes, même une fois filtré", () => {
    const { result } = renderHook(() => useInvoiceRows([ADRIEN, SARAH, LEA]));

    act(() => result.current.setFilter("OVERDUE"));
    expect(result.current.counts).toEqual({ ALL: 3, OVERDUE: 1, DUE: 1, UP_TO_DATE: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import {
  countOverdueInvoices,
  countPendingInvoices,
  InvoiceState,
  resolveInvoiceState,
} from "./invoice.util";

const TODAY = "2026-07-29";

describe("resolveInvoiceState", () => {
  it("rend PAID et CANCELLED sans regarder l'échéance (le temps ne les rouvre pas)", () => {
    const past = { dueDate: "2020-01-01" };
    expect(resolveInvoiceState({ ...past, status: InvoiceStatus.PAID }, TODAY)).toBe(
      InvoiceState.PAID,
    );
    expect(resolveInvoiceState({ ...past, status: InvoiceStatus.CANCELLED }, TODAY)).toBe(
      InvoiceState.CANCELLED,
    );
  });

  it("dérive OVERDUE d'une facture PENDING dont l'échéance est passée", () => {
    const state = resolveInvoiceState(
      { status: InvoiceStatus.PENDING, dueDate: "2026-07-28" },
      TODAY,
    );
    expect(state).toBe(InvoiceState.OVERDUE);
  });

  it("ne met pas en retard une échéance du jour — le débiteur a sa journée", () => {
    expect(resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: TODAY }, TODAY)).toBe(
      InvoiceState.PENDING,
    );
  });

  it("rend PENDING tant que l'échéance est à venir", () => {
    expect(
      resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: "2026-08-31" }, TODAY),
    ).toBe(InvoiceState.PENDING);
  });

  it("rend null pour un DRAFT : une facture non émise n'a pas d'état d'affichage", () => {
    expect(
      resolveInvoiceState({ status: InvoiceStatus.DRAFT, dueDate: "2026-07-28" }, TODAY),
    ).toBeNull();
  });

  it("rend null sur une date illisible plutôt que d'annoncer un retard à tort", () => {
    expect(
      resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: "31/07/2026" }, TODAY),
    ).toBeNull();
    expect(
      resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: "2026-07-28" }, "hier"),
    ).toBeNull();
  });

  it("compare des dates civiles, pas des instants : le passage de mois ne piège pas", () => {
    expect(
      resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: "2026-06-30" }, "2026-07-01"),
    ).toBe(InvoiceState.OVERDUE);
    expect(
      resolveInvoiceState({ status: InvoiceStatus.PENDING, dueDate: "2026-07-01" }, "2026-06-30"),
    ).toBe(InvoiceState.PENDING);
  });
});

describe("countPendingInvoices / countOverdueInvoices", () => {
  // Un portefeuille complet : les quatre impayées (deux à venir, deux échues) et les quatre lignes
  // qui ne doivent entrer dans aucun compteur.
  const INVOICES = [
    { status: InvoiceStatus.PENDING, dueDate: "2026-08-31" }, // à venir
    { status: InvoiceStatus.PENDING, dueDate: TODAY }, // échue aujourd'hui = pas encore en retard
    { status: InvoiceStatus.PENDING, dueDate: "2026-07-28" }, // en retard d'un jour
    { status: InvoiceStatus.PENDING, dueDate: "2026-06-01" }, // en retard de deux mois
    { status: InvoiceStatus.PAID, dueDate: "2020-01-01" },
    { status: InvoiceStatus.CANCELLED, dueDate: "2020-01-01" },
    { status: InvoiceStatus.DRAFT, dueDate: "2026-07-28" },
    { status: InvoiceStatus.PENDING, dueDate: "31/07/2026" }, // date illisible
  ];

  /**
   * LE test de la promotion. L'ancien compteur côté web filtrait `status === PENDING` — or une
   * facture en retard porte ce statut-là (`OVERDUE` est dérivé, jamais stocké). Il en comptait donc
   * 4, mélangeant les factures qui vont bien et celles à relancer, et chaque facture en retard
   * serait apparue une seconde fois dans la tuile « en retard ».
   */
  it("partitionne l'impayé : une facture en retard n'est jamais aussi « en attente »", () => {
    expect(countPendingInvoices(INVOICES, TODAY)).toBe(2);
    expect(countOverdueInvoices(INVOICES, TODAY)).toBe(2);

    // Les deux tuiles côte à côte totalisent l'impayé, sans doublon ni oubli.
    const unpaid = INVOICES.filter(
      (invoice) => invoice.status === InvoiceStatus.PENDING && invoice.dueDate !== "31/07/2026",
    ).length;
    expect(
      (countPendingInvoices(INVOICES, TODAY) ?? 0) + (countOverdueInvoices(INVOICES, TODAY) ?? 0),
    ).toBe(unpaid);
  });

  // Payée, annulée, brouillon : plus rien n'est dû, aucune des deux tuiles ne les réclame.
  it("ignore les factures réglées, annulées et non émises", () => {
    const settled = INVOICES.filter((invoice) => invoice.status !== InvoiceStatus.PENDING);
    expect(countPendingInvoices(settled, TODAY)).toBe(0);
    expect(countOverdueInvoices(settled, TODAY)).toBe(0);
  });

  /**
   * Une échéance illisible ne se résout pas (`resolveInvoiceState` rend `null`) : la ligne n'entre
   * dans aucun compteur. La ranger d'office en « en attente » masquerait un retard, et en « en
   * retard » inventerait une alerte — dans les deux cas on aurait deviné à la place de la donnée.
   */
  it("n'attribue aucune tuile à une facture dont l'état ne se résout pas", () => {
    const unreadable = [{ status: InvoiceStatus.PENDING, dueDate: "31/07/2026" }];
    expect(countPendingInvoices(unreadable, TODAY)).toBe(0);
    expect(countOverdueInvoices(unreadable, TODAY)).toBe(0);
  });

  // Liste absente (chargement, panne) → « — ». Liste vide → « 0 ». Les deux ne disent pas la même
  // chose, et les confondre annoncerait « rien à relancer » sur une API injoignable.
  it("distingue « je ne sais pas » (null) de « aucune facture » (0)", () => {
    expect(countPendingInvoices(undefined, TODAY)).toBeNull();
    expect(countOverdueInvoices(null, TODAY)).toBeNull();
    expect(countPendingInvoices([], TODAY)).toBe(0);
    expect(countOverdueInvoices([], TODAY)).toBe(0);
  });

  // `today` illisible : aucune comparaison n'est possible, donc aucun état ne se résout. Zéro
  // partout plutôt qu'un retard annoncé au hasard.
  it("ne déclare aucun retard si la date du jour est illisible", () => {
    expect(countOverdueInvoices(INVOICES, "hier")).toBe(0);
    expect(countPendingInvoices(INVOICES, "hier")).toBe(0);
  });
});

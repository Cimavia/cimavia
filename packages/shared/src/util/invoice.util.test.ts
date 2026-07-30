import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "../dto/invoice.schema";
import { InvoiceState, resolveInvoiceState } from "./invoice.util";

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

import { describe, expect, it } from "vitest";
import {
  INVOICE_AMOUNT_MAX_CENTS,
  planBillingSchema,
  updateInvoiceStatusSchema,
} from "./invoice.schema";

const validBilling = {
  amountCents: 4990,
  dueDate: "2026-07-31",
};

describe("planBillingSchema", () => {
  it("accepte des termes valides (note optionnelle)", () => {
    expect(planBillingSchema.safeParse(validBilling).success).toBe(true);
    expect(planBillingSchema.safeParse({ ...validBilling, note: "Coaching" }).success).toBe(true);
    expect(planBillingSchema.safeParse({ ...validBilling, note: null }).success).toBe(true);
  });

  it("refuse un montant non entier, négatif ou hors plafond", () => {
    expect(planBillingSchema.safeParse({ ...validBilling, amountCents: 49.9 }).success).toBe(false);
    expect(planBillingSchema.safeParse({ ...validBilling, amountCents: 0 }).success).toBe(false);
    expect(
      planBillingSchema.safeParse({ ...validBilling, amountCents: INVOICE_AMOUNT_MAX_CENTS + 1 })
        .success,
    ).toBe(false);
  });

  it("refuse une échéance qui n'est pas une date civile", () => {
    expect(
      planBillingSchema.safeParse({ ...validBilling, dueDate: "2026-07-31T00:00:00Z" }).success,
    ).toBe(false);
  });

  it("refuse une clé inattendue (strict) — ni athlète, ni période, ni devise ici", () => {
    expect(planBillingSchema.safeParse({ ...validBilling, athleteId: "ath_1" }).success).toBe(
      false,
    );
    expect(planBillingSchema.safeParse({ ...validBilling, period: "2026-07" }).success).toBe(false);
  });
});

describe("updateInvoiceStatusSchema", () => {
  it("n'accepte que PENDING ou PAID — jamais DRAFT (facture non émise)", () => {
    expect(updateInvoiceStatusSchema.safeParse({ status: "PAID" }).success).toBe(true);
    expect(updateInvoiceStatusSchema.safeParse({ status: "PENDING" }).success).toBe(true);
    expect(updateInvoiceStatusSchema.safeParse({ status: "DRAFT" }).success).toBe(false);
  });
});

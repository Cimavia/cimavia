import { describe, expect, it } from "vitest";
import {
  createInvoiceSchema,
  DEFAULT_INVOICE_CURRENCY,
  INVOICE_AMOUNT_MAX_CENTS,
} from "./invoice.schema";

const validInput = {
  athleteId: "ath_1",
  period: "2026-07",
  amountCents: 4990,
  dueDate: "2026-07-31",
};

describe("createInvoiceSchema", () => {
  it("accepte une entrée valide et applique la devise par défaut", () => {
    const parsed = createInvoiceSchema.parse(validInput);
    expect(parsed.currency).toBe(DEFAULT_INVOICE_CURRENCY);
    expect(parsed.amountCents).toBe(4990);
  });

  it("refuse une période hors format YYYY-MM", () => {
    expect(createInvoiceSchema.safeParse({ ...validInput, period: "2026-7" }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...validInput, period: "2026-13" }).success).toBe(false);
  });

  it("refuse un montant non entier, négatif ou hors plafond", () => {
    expect(createInvoiceSchema.safeParse({ ...validInput, amountCents: 49.9 }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...validInput, amountCents: 0 }).success).toBe(false);
    expect(
      createInvoiceSchema.safeParse({ ...validInput, amountCents: INVOICE_AMOUNT_MAX_CENTS + 1 })
        .success,
    ).toBe(false);
  });

  it("refuse une devise inconnue et une clé inattendue (strict)", () => {
    expect(createInvoiceSchema.safeParse({ ...validInput, currency: "USD" }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...validInput, status: "PAID" }).success).toBe(false);
  });

  it("refuse une échéance qui n'est pas une date civile", () => {
    expect(
      createInvoiceSchema.safeParse({ ...validInput, dueDate: "2026-07-31T00:00:00Z" }).success,
    ).toBe(false);
  });
});

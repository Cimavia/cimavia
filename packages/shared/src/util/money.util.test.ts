import { describe, expect, it } from "vitest";
import { formatInvoicePeriod, formatMoney } from "./money.util";

describe("formatMoney", () => {
  it("divise les centimes par 100 et applique devise + locale", () => {
    // Espaces insécables dans la sortie Intl → on teste par inclusion des chiffres/symboles.
    expect(formatMoney(4990, "EUR", "fr-FR")).toContain("49,90");
    expect(formatMoney(4990, "EUR", "fr-FR")).toContain("€");
  });

  it("formate un montant entier sans dériver (pas de float)", () => {
    expect(formatMoney(10000, "EUR", "fr-FR")).toContain("100,00");
    expect(formatMoney(0, "EUR", "fr-FR")).toContain("0,00");
  });
});

describe("formatInvoicePeriod", () => {
  it("rend le mois civil dans la locale, en UTC", () => {
    expect(formatInvoicePeriod("2026-07", "fr-FR")).toBe("juillet 2026");
    expect(formatInvoicePeriod("2026-01", "fr-FR")).toBe("janvier 2026");
    expect(formatInvoicePeriod("2026-12", "fr-FR")).toBe("décembre 2026");
  });

  // L'erreur nomme la période fautive : c'est elle qu'il faut retrouver dans les données.
  it("lève sur une période illisible plutôt que de replier", () => {
    for (const period of ["2026-13", "2026-7", "juillet", "2026-07-01", "x2026-07"]) {
      expect(() => formatInvoicePeriod(period, "fr-FR")).toThrow(period);
    }
  });
});

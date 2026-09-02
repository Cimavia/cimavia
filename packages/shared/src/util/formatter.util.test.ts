import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayLabel,
  formatIsoDayNumber,
  formatIsoFullDay,
  formatIsoWeekday,
  RELATIVE_TIME_KEY,
} from "./date-format.util";
import { createFormatters } from "./formatter.util";
import { formatInvoicePeriod, formatMoney } from "./money.util";

const fakeT = (key: string, params: { count: number }) => `${key}:${params.count}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("createFormatters", () => {
  /**
   * Le seul vrai risque d'une fabrique : raccorder un nom au mauvais formateur. Une inversion de
   * `formatDayLabel` et `formatFullDay` ne se verrait nulle part ailleurs — les deux rendent une
   * date française plausible. On compare donc au formateur du paquet, pas à un texte attendu :
   * l'affirmation reste vraie quand la version d'ICU change la place d'un point ou d'une espace.
   */
  it("raccorde chaque nom au formateur qu'il annonce", () => {
    const format = createFormatters(() => "fr-FR", fakeT);

    expect(format.formatMoney(12_50, "EUR")).toBe(formatMoney(12_50, "EUR", "fr-FR"));
    expect(format.formatPeriod("2026-09")).toBe(formatInvoicePeriod("2026-09", "fr-FR"));
    expect(format.formatDate("2026-10-14")).toBe(formatIsoDate("2026-10-14", "fr-FR"));
    expect(format.formatDayLabel("2026-10-14")).toBe(formatIsoDayLabel("2026-10-14", "fr-FR"));
    expect(format.formatFullDay("2026-10-14")).toBe(formatIsoFullDay("2026-10-14", "fr-FR"));
    expect(format.formatWeekday("2026-10-14")).toBe(formatIsoWeekday("2026-10-14", "fr-FR"));
    expect(format.formatDayNumber("2026-10-14")).toBe(formatIsoDayNumber("2026-10-14", "fr-FR"));
    expect(format.formatDateRange("2026-10-12", "2026-10-18")).toBe(
      formatIsoDateRange("2026-10-12", "2026-10-18", "fr-FR"),
    );
    expect(format.formatDateTime("2026-10-14T08:30:00.000Z")).toBe(
      formatIsoDateTime("2026-10-14T08:30:00.000Z", "fr-FR"),
    );
  });

  /**
   * La raison pour laquelle `getLocale` est une fonction et non une chaîne. Une locale lue à la
   * construction figerait tous les formats jusqu'au prochain lancement de l'app — le changement de
   * langue ne prendrait qu'au redémarrage, et seulement sur les écrans reconstruits.
   */
  it("relit la locale à CHAQUE appel, sans la figer à la construction", () => {
    let locale = "fr-FR";
    const format = createFormatters(() => locale, fakeT);

    const francais = format.formatDate("2026-10-14");
    locale = "en-US";

    expect(format.formatDate("2026-10-14")).not.toBe(francais);
    expect(format.formatDate("2026-10-14")).toBe(formatIsoDate("2026-10-14", "en-US"));
  });

  it("transmet le traducteur au temps relatif, qui en a besoin pour se dire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
    const format = createFormatters(() => "fr-FR", fakeT);

    expect(format.formatRelativeTime("2026-10-14T08:00:00.000Z")).toBe(
      `${RELATIVE_TIME_KEY.hour}:2`,
    );
  });

  /**
   * L'instant de référence est lu au moment de l'APPEL. Capturé à la construction, « il y a 2 h »
   * resterait « il y a 2 h » tant que l'app tourne — un fil de messagerie ouvert longtemps
   * afficherait des durées qui ne bougent plus.
   */
  it("compare à l'instant courant, pas à celui de la construction", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
    const format = createFormatters(() => "fr-FR", fakeT);

    vi.setSystemTime(new Date("2026-10-14T13:00:00.000Z"));

    expect(format.formatRelativeTime("2026-10-14T08:00:00.000Z")).toBe(
      `${RELATIVE_TIME_KEY.hour}:5`,
    );
  });
});

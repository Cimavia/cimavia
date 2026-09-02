import { formatIsoDate, RELATIVE_TIME_KEY, formatMoney as sharedFormatMoney } from "@cmv/shared";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/shared/lib/i18n";
import { formatDate, formatRelativeTime } from "@/shared/util/date.util";
import { formatMoney } from "@/shared/util/money.util";

afterEach(async () => {
  await i18n.changeLanguage("fr");
});

/**
 * Ce que ces trois fichiers font, et rien d'autre : brancher la locale d'i18next sur les formateurs
 * de `@cmv/shared`. Le comportement des formateurs eux-mêmes est éprouvé dans le paquet — ici on
 * vérifie le CÂBLAGE, qui est la seule chose que le web ajoute.
 */
describe("les adaptateurs de formatage du web", () => {
  it("formate dans la langue COURANTE d'i18next, pas dans celle du démarrage", async () => {
    expect(formatDate("2026-10-14")).toBe(formatIsoDate("2026-10-14", "fr"));

    await i18n.changeLanguage("en");

    // Le vrai risque du câblage : une locale capturée au chargement du module resterait « fr » ici,
    // et le changement de langue ne prendrait qu'au prochain rechargement de la page.
    expect(formatDate("2026-10-14")).toBe(formatIsoDate("2026-10-14", "en"));
    expect(formatDate("2026-10-14")).not.toBe(formatIsoDate("2026-10-14", "fr"));
  });

  it("branche l'argent sur la même locale que les dates", async () => {
    await i18n.changeLanguage("en");
    expect(formatMoney(12_50, "EUR")).toBe(sharedFormatMoney(12_50, "EUR", "en"));
  });
  /**
   * `formatRelativeTime` est la seule des dix fonctions à avoir besoin d'i18next AU-DELÀ de la
   * locale : la bascule « il y a 2 h » / date complète vit dans `@cmv/shared`, mais le texte reste
   * au catalogue de l'app. On compare donc au traducteur lui-même, pas à un français en dur.
   */
  it("passe le traducteur, et pas seulement la locale, au temps relatif", () => {
    const ilYaDeuxHeures = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    expect(formatRelativeTime(ilYaDeuxHeures)).toBe(i18n.t(RELATIVE_TIME_KEY.hour, { count: 2 }));
  });
});

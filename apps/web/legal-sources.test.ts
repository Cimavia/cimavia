import { LEGAL_DOCUMENTS, LEGAL_LOCALES } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { legalTitle, readLegalSources } from "./legal-pages";

/**
 * Les textes réellement présents sous `legal/` contre la table de `@cmv/shared` (#778). Les apps
 * construisent leurs liens depuis la table, nginx sert les fichiers : un document listé sans
 * fichier serait un lien vers une 404, un fichier hors table une page que personne n'atteint.
 */
describe("les documents légaux", () => {
  const sources = readLegalSources();

  it("existent, et eux seuls, dans chaque langue rédigée", () => {
    const published = sources.map(({ locale, document }) => `${locale}/${document}`);
    const expected = LEGAL_LOCALES.flatMap((locale) =>
      LEGAL_DOCUMENTS.map(({ document }) => `${locale}/${document}`),
    );
    expect(published.toSorted()).toEqual(expected.toSorted());
  });

  it.each(sources)("$locale/$document porte un titre", (source) => {
    expect(legalTitle(source)).not.toBe("");
  });

  /**
   * Tout lien qui ne sort pas du site vise un document publié, par son nom nu (`href="terms"`) :
   * c'est la seule forme que nginx résout. `./terms`, `terms.html` ou `/legal/fr/terms` tomberaient
   * sur une 404 — ou, pour le dernier, figeraient la langue.
   */
  it.each(sources)("$locale/$document ne renvoie qu'à des documents publiés", (source) => {
    const known = new Set<string>(LEGAL_DOCUMENTS.map(({ document }) => document));
    const internal = [...source.fragment.matchAll(/href="([^"]*)"/g)]
      .map(([, href]) => href ?? "")
      .filter((href) => !/^(?:https:\/\/|mailto:)/.test(href));
    expect(internal.filter((href) => !known.has(href))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, LEGAL_LOCALES, legalDocumentUrl } from "./legal.util";

describe("LEGAL_DOCUMENTS", () => {
  // Ces chemins sont publiés : déclarés aux stores, servis par nginx, ouverts par Access. En
  // renommer un casserait un lien que l'app ne contrôle plus.
  it("liste les documents sous leur chemin publié", () => {
    expect(LEGAL_DOCUMENTS.map(({ document }) => document)).toEqual([
      "privacy",
      "legal-notice",
      "terms",
      "account-deletion",
    ]);
  });

  it("ne rédige pour l'instant que le français", () => {
    expect(LEGAL_LOCALES).toEqual(["fr"]);
  });
});

describe("legalDocumentUrl", () => {
  it("colle le chemin du document à l'origine du web", () => {
    expect(legalDocumentUrl("https://app.cimavia.fr", "privacy", "fr")).toBe(
      "https://app.cimavia.fr/legal/fr/privacy",
    );
  });

  it("retire la barre oblique finale de l'origine", () => {
    expect(legalDocumentUrl("https://app.cimavia.fr/", "terms", "fr")).toBe(
      "https://app.cimavia.fr/legal/fr/terms",
    );
  });

  it("ne garde que la langue d'une étiquette régionale", () => {
    expect(legalDocumentUrl("https://app.cimavia.fr", "legal-notice", "FR-fr")).toBe(
      "https://app.cimavia.fr/legal/fr/legal-notice",
    );
  });

  // Une langue d'interface sans texte rédigé renverrait sur une 404.
  it("retombe sur le français pour une langue non rédigée", () => {
    expect(legalDocumentUrl("https://app.cimavia.fr", "privacy", "en")).toBe(
      "https://app.cimavia.fr/legal/fr/privacy",
    );
  });

  // i18next n'a pas de langue avant sa première initialisation.
  it.each(["", undefined])("retombe sur le français pour une langue absente : %j", (language) => {
    expect(legalDocumentUrl("https://app.cimavia.fr", "privacy", language)).toBe(
      "https://app.cimavia.fr/legal/fr/privacy",
    );
  });
});

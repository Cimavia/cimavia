import { render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import fr from "@/shared/locale/fr.json";
import { renderWithProviders } from "../../../../test/render";
import { LegalConsent, LegalLinks } from "./LegalLinks";

describe("LegalLinks", () => {
  it("ouvre chaque document à son chemin publié, dans un nouvel onglet", () => {
    renderWithProviders(<LegalLinks />);
    // `cimode` n'est pas une langue rédigée : le lien retombe sur le français.
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/legal/fr/privacy",
      "/legal/fr/legal-notice",
      "/legal/fr/terms",
      "/legal/fr/account-deletion",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("nomme la navigation et chaque document", () => {
    renderWithProviders(<LegalLinks />);
    expect(screen.getByRole("navigation", { name: "legal.title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "legal.legalNotice" })).toBeInTheDocument();
  });
});

describe("LegalConsent", () => {
  /**
   * Avec le VRAI catalogue, et non `cimode` : c'est la phrase française qui porte les balises
   * `<terms>` et `<privacy>`. Une balise renommée d'un seul côté rendrait la phrase sans ses liens,
   * et `check:i18n` ne lit pas l'intérieur d'une valeur.
   */
  it("pose les deux liens dans la phrase du catalogue", () => {
    const i18n = createInstance();
    void i18n.init({ lng: "fr", resources: { fr: { translation: fr } } });
    render(
      <I18nextProvider i18n={i18n}>
        <LegalConsent />
      </I18nextProvider>,
    );
    expect(screen.getByRole("link", { name: "conditions d'utilisation" })).toHaveAttribute(
      "href",
      "/legal/fr/terms",
    );
    expect(screen.getByRole("link", { name: "politique de confidentialité" })).toHaveAttribute(
      "href",
      "/legal/fr/privacy",
    );
    expect(screen.getByText(/En créant ton compte, tu acceptes les/)).toBeInTheDocument();
  });
});

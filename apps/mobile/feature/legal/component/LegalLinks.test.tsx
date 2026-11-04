import * as Sentry from "@sentry/react-native";
import { render, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { Linking } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_URL } from "@/shared/lib/web-url";
import fr from "@/shared/locale/fr.json";
import { press, renderRn } from "@/test/render";
import { LegalConsent, LegalLinks } from "./LegalLinks";

const open = vi.spyOn(Linking, "openURL");

beforeEach(() => {
  open.mockReset().mockResolvedValue(true);
});

describe("LegalLinks", () => {
  // `cimode` n'est pas une langue rédigée : le lien retombe sur le français.
  it.each([
    ["legal.privacy", "privacy"],
    ["legal.legalNotice", "legal-notice"],
    ["legal.terms", "terms"],
  ])("ouvre %s dans le navigateur, sur le web", (label, document) => {
    const { getByText } = renderRn(<LegalLinks />);

    press(getByText(label));

    expect(open).toHaveBeenCalledWith(`${WEB_URL}/legal/fr/${document}`);
  });

  it("signale à Sentry un lien que le système refuse d'ouvrir", async () => {
    const cause = new Error("aucun navigateur");
    open.mockRejectedValue(cause);
    const { getByText } = renderRn(<LegalLinks />);

    press(getByText("legal.terms"));

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(cause));
  });
});

describe("LegalConsent", () => {
  /**
   * Avec le VRAI catalogue, et non `cimode` : c'est la phrase française qui porte les balises
   * `<terms>` et `<privacy>`. Une balise renommée d'un seul côté rendrait la phrase sans ses liens.
   */
  function renderInFrench() {
    const i18n = createInstance();
    void i18n.init({ lng: "fr", resources: { fr: { translation: fr } } });
    return render(
      <I18nextProvider i18n={i18n}>
        <LegalConsent />
      </I18nextProvider>,
    );
  }

  it("ouvre les conditions depuis la phrase", () => {
    const { getByText } = renderInFrench();

    press(getByText("conditions d'utilisation"));

    expect(open).toHaveBeenCalledWith(`${WEB_URL}/legal/fr/terms`);
  });

  it("ouvre la politique depuis la phrase", () => {
    const { getByText } = renderInFrench();

    press(getByText("politique de confidentialité"));

    expect(open).toHaveBeenCalledWith(`${WEB_URL}/legal/fr/privacy`);
  });
});

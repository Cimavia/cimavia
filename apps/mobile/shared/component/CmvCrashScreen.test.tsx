import * as Sentry from "@sentry/react-native";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmvCrashScreen } from "./CmvCrashScreen";

/**
 * `useTranslation` est remplacé plutôt que monté sur l'instance i18next du harnais : celle-ci
 * rendrait la clé, ce qui est exactement le signal que ce composant lit comme « i18next est
 * cassé ». Les deux cas se confondraient. Ici le traducteur EST la variable de l'expérience.
 */
const translate = vi.fn<(key: string) => string>();
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

const CATALOGUE: Record<string, string> = {
  "common.crash.title": "L'app a rencontré un problème",
  "common.crash.description":
    "L'incident nous a été signalé. Réessaie pour reprendre où tu en étais.",
  "common.crash.retry": "Réessayer",
};

function setup(error = new Error("le rendu est tombé")) {
  const retry = vi.fn(() => Promise.resolve());
  render(<CmvCrashScreen error={error} retry={retry} />);
  return { retry, error };
}

beforeEach(() => {
  translate.mockImplementation((key) => CATALOGUE[key] ?? key);
});

describe("CmvCrashScreen (mobile)", () => {
  it("remonte l'erreur à Sentry", () => {
    const { error } = setup();

    // La moitié invisible de cet écran : sans elle, l'utilisateur est repêché mais on ne saura
    // jamais de quoi. Côté mobile l'alternative était la fermeture pure et simple de l'app.
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("affiche le catalogue quand i18next répond", () => {
    setup();

    expect(screen.getByText("L'app a rencontré un problème")).toBeTruthy();
    expect(screen.getByText("Réessayer")).toBeTruthy();
  });

  it("retombe sur du français en dur quand i18next rend la clé brute", () => {
    // Le cas où i18next est LUI-MÊME ce qui a cassé : sans repli, l'écran de panne afficherait
    // `common.crash.title` en toutes lettres.
    translate.mockImplementation((key) => key);

    setup();

    expect(screen.getByText("L'app a rencontré un problème")).toBeTruthy();
    expect(screen.queryByText("common.crash.title")).toBeNull();
  });

  it("remonte l'arbre quand on réessaie, et pas avant", () => {
    // `retry` est la SEULE réparation disponible ici : pas d'équivalent mobile du rechargement de
    // page, sauf à embarquer expo-updates.
    const { retry } = setup();

    // Sans cette première assertion, un `retry` appelé au rendu — donc une boucle de re-montage
    // sur un arbre qui retombe — passerait pour un appui réussi.
    expect(retry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Réessayer"));

    expect(retry).toHaveBeenCalledOnce();
  });
});

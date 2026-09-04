import * as Sentry from "@sentry/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmvCrashScreen } from "./CmvCrashScreen";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

/**
 * `useTranslation` est remplacé plutôt que monté via `renderWithProviders`.
 *
 * Le harnais commun tourne en `cimode`, où `t()` rend TOUJOURS la clé : c'est exactement le signal
 * que ce composant interprète comme « i18next est cassé ». Il ne saurait donc pas produire le cas
 * nominal, et les deux cas se confondraient. Ici le traducteur est la variable de l'expérience.
 */
const translate = vi.fn<(key: string) => string>();
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

const CATALOGUE: Record<string, string> = {
  "common.crash.title": "L'application a rencontré un problème",
  "common.crash.description":
    "L'incident nous a été signalé. Rechargez la page pour reprendre où vous en étiez.",
  "common.crash.reload": "Recharger la page",
};

beforeEach(() => {
  vi.clearAllMocks();
  translate.mockImplementation((key) => CATALOGUE[key] ?? key);
});

describe("CmvCrashScreen", () => {
  it("remonte l'erreur à Sentry", () => {
    const error = new Error("le rendu est tombé");

    render(<CmvCrashScreen error={error} />);

    // C'est la moitié invisible de cet écran : sans elle, l'utilisateur est repêché mais on ne
    // saura jamais de quoi.
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("affiche le catalogue quand i18next répond", () => {
    render(<CmvCrashScreen error={new Error("boum")} />);

    expect(screen.getByRole("heading")).toHaveTextContent("L'application a rencontré un problème");
    expect(screen.getByRole("button")).toHaveTextContent("Recharger la page");
  });

  it("retombe sur du français en dur quand i18next rend la clé brute", () => {
    // Le cas où i18next est LUI-MÊME ce qui a cassé : sans repli, l'écran de panne afficherait
    // `common.crash.title` en toutes lettres — soit l'aveu de panne par-dessus la panne.
    translate.mockImplementation((key) => key);

    render(<CmvCrashScreen error={new Error("i18n est mort")} />);

    expect(screen.getByRole("heading")).toHaveTextContent("L'application a rencontré un problème");
    expect(screen.queryByText("common.crash.title")).not.toBeInTheDocument();
  });

  it("recharge la page plutôt que de re-rendre l'arbre qui vient de tomber", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<CmvCrashScreen error={new Error("boum")} />);
    await userEvent.setup().click(screen.getByRole("button"));

    expect(reload).toHaveBeenCalledOnce();
  });
});

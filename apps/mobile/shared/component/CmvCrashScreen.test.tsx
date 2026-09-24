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

/**
 * `isEnabled` est une constante du module : un getter sur un état hissé est ce qui laisse chaque
 * test choisir entre le binaire de production et le dev client, sans recharger le module.
 */
const updates = vi.hoisted(() => ({
  enabled: false,
  reloadAsync: vi.fn<() => Promise<void>>(),
}));
vi.mock("expo-updates", () => ({
  get isEnabled() {
    return updates.enabled;
  },
  reloadAsync: updates.reloadAsync,
}));

const CATALOGUE: Record<string, string> = {
  "common.crash.title": "L'app a rencontré un problème",
  "common.crash.description": "L'incident nous a été signalé. Relance l'app pour repartir.",
  "common.crash.relaunch": "Relancer",
};

function setup(error = new Error("le rendu est tombé")) {
  const retry = vi.fn(() => Promise.resolve());
  render(<CmvCrashScreen error={error} retry={retry} />);
  return { retry, error };
}

beforeEach(() => {
  translate.mockImplementation((key) => CATALOGUE[key] ?? key);
  updates.enabled = false;
  updates.reloadAsync.mockReset().mockResolvedValue(undefined);
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
    expect(screen.getByText("Relancer")).toBeTruthy();
  });

  it("retombe sur du français en dur quand i18next rend la clé brute", () => {
    // Le cas où i18next est LUI-MÊME ce qui a cassé : sans repli, l'écran de panne afficherait
    // `common.crash.title` en toutes lettres.
    translate.mockImplementation((key) => key);

    setup();

    expect(screen.getByText("L'app a rencontré un problème")).toBeTruthy();
    expect(screen.queryByText("common.crash.title")).toBeNull();
  });

  it("relance le JS en production, et pas avant l'appui", async () => {
    // La relance est ce qui applique un update téléchargé en arrière-plan : le correctif du crash
    // est souvent déjà sur le téléphone, en attente du lancement suivant.
    updates.enabled = true;
    const { retry } = setup();

    // Sans cette première assertion, une relance au rendu — donc une boucle sur un JS qui retombe
    // — passerait pour un appui réussi.
    expect(updates.reloadAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Relancer"));

    await vi.waitFor(() => expect(updates.reloadAsync).toHaveBeenCalledOnce());
    expect(retry).not.toHaveBeenCalled();
  });

  it("re-monte l'arbre quand expo-updates est désactivé", async () => {
    // Le dev client : `reloadAsync` y rejetterait. Re-monter est la seule réparation disponible.
    const { retry } = setup();
    expect(retry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Relancer"));

    await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("re-monte l'arbre et signale l'échec quand la relance rejette", async () => {
    // Ne devrait pas arriver sur un binaire bien installé : si ça arrive, on veut le savoir, et
    // l'utilisateur garde une réparation.
    updates.enabled = true;
    const reloadError = new Error("pas de runtime JS");
    updates.reloadAsync.mockRejectedValue(reloadError);
    const { retry } = setup();

    fireEvent.click(screen.getByText("Relancer"));

    await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(Sentry.captureException).toHaveBeenCalledWith(reloadError);
  });
});

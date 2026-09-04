import { EMAILABLE_NOTIFICATION_TYPES, NotificationType } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationEmailSection } from "@/feature/notification/component/NotificationEmailSection";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/notification/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    notificationPreferenceApi: { list: vi.fn(), replace: vi.fn() },
    notificationPreferenceKeys: shared.notificationPreferenceKeys,
  };
});

const { notificationPreferenceApi } = await import("@/feature/notification/api");
const list = vi.mocked(notificationPreferenceApi.list);
const replace = vi.mocked(notificationPreferenceApi.replace);

const OFF = EMAILABLE_NOTIFICATION_TYPES.map((type) => ({ type, enabled: false }));
const gridWith = (enabled: readonly string[]) =>
  EMAILABLE_NOTIFICATION_TYPES.map((type) => ({ type, enabled: enabled.includes(type) }));

/** Les interrupteurs, dans l'ordre de `EMAILABLE_NOTIFICATION_TYPES`. */
const switches = () => screen.getAllByRole("checkbox");

beforeEach(() => {
  list.mockResolvedValue(OFF);
  replace.mockResolvedValue(OFF);
});

describe("NotificationEmailSection", () => {
  // L'opt-in est le défaut du produit : un compte qui n'a rien réglé doit voir tout éteint, et
  // une ligne par type envoyable — jamais une liste vide qui laisserait croire à une panne.
  it("montre un interrupteur par type, tous éteints par défaut", async () => {
    renderWithProviders(<NotificationEmailSection />);

    await waitFor(() => expect(switches()).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length));
    expect(switches().every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  /**
   * L'API attend l'ENSEMBLE des types activés, pas un delta. Ce test fige le corps envoyé : une
   * bascule qui n'enverrait que le type touché effacerait tous les autres réglages, et la panne
   * ne se verrait qu'après un rechargement.
   */
  it("enregistre l'ensemble des types activés au premier clic", async () => {
    list.mockResolvedValue(gridWith([NotificationType.MESSAGE_RECEIVED]));
    const { user } = renderWithProviders(<NotificationEmailSection />);
    await waitFor(() => expect(switches()).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length));

    // `PLAN_PUBLISHED` est le premier de la liste, `MESSAGE_RECEIVED` le troisième.
    await user.click(switches()[0] as HTMLElement);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        enabled: [NotificationType.PLAN_PUBLISHED, NotificationType.MESSAGE_RECEIVED],
      }),
    );
  });

  // Bascule immédiate : il n'y a PAS de bouton à presser, donc rien ne doit rester à valider.
  it("n'offre aucun bouton d'enregistrement", async () => {
    renderWithProviders(<NotificationEmailSection />);
    await waitFor(() => expect(switches()).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length));

    expect(screen.queryByRole("button")).toBeNull();
  });

  /**
   * Le contrat de l'optimisme : l'interrupteur bascule tout de suite, mais REVIENT si l'écriture
   * échoue. Un interrupteur qui reste allumé sur une écriture perdue ment à l'utilisateur, qui
   * croira recevoir des e-mails qu'il ne recevra jamais.
   */
  it("remet l'interrupteur en place quand l'enregistrement échoue", async () => {
    replace.mockRejectedValue(new Error("réseau"));
    const { user } = renderWithProviders(<NotificationEmailSection />);
    await waitFor(() => expect(switches()).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length));

    await user.click(switches()[0] as HTMLElement);

    await waitFor(() => expect((switches()[0] as HTMLInputElement).checked).toBe(false));
  });

  it("dit que la lecture a échoué plutôt que d'afficher une grille vide", async () => {
    list.mockRejectedValue(new Error("réseau"));
    renderWithProviders(<NotificationEmailSection />);

    await waitFor(() => expect(screen.getByText("common.error")).toBeDefined());
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

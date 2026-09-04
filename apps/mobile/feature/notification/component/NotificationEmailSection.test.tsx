import { EMAILABLE_NOTIFICATION_TYPES, NotificationType } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationPreferenceApi } from "@/feature/notification/api";
import { NotificationEmailSection } from "@/feature/notification/component/NotificationEmailSection";
import { pressButton, renderRn } from "@/test/render";

vi.mock("@/feature/notification/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    notificationPreferenceApi: { list: vi.fn(), replace: vi.fn() },
    notificationPreferenceKeys: shared.notificationPreferenceKeys,
  };
});

const list = vi.mocked(notificationPreferenceApi.list);
const replace = vi.mocked(notificationPreferenceApi.replace);

const gridWith = (enabled: readonly string[]) =>
  EMAILABLE_NOTIFICATION_TYPES.map((type) => ({ type, enabled: enabled.includes(type) }));

/**
 * `Switch` de React Native rend une case à cocher sous `react-native-web` — c'est justement
 * pourquoi cet écran l'emploie plutôt qu'un `Pressable` habillé : `accessibilityState` est
 * invisible du harnais (dette Q-6), donc un interrupteur maison ne serait pas éprouvable.
 */
const switches = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('input[type="checkbox"]'));

beforeEach(() => {
  list.mockResolvedValue(gridWith([]));
  replace.mockResolvedValue(gridWith([]));
});

describe("NotificationEmailSection", () => {
  it("montre un interrupteur par type envoyable, tous éteints par défaut", async () => {
    const { container } = renderRn(<NotificationEmailSection />);

    await waitFor(() =>
      expect(switches(container)).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length),
    );
    expect(switches(container).every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  /**
   * L'API attend l'ENSEMBLE des types activés, pas un delta. Une bascule qui n'enverrait que le
   * type touché effacerait tous les autres réglages, et la panne ne se verrait qu'au rechargement.
   */
  it("enregistre l'ensemble des types activés dès la bascule", async () => {
    list.mockResolvedValue(gridWith([NotificationType.MESSAGE_RECEIVED]));
    const { container } = renderRn(<NotificationEmailSection />);
    await waitFor(() =>
      expect(switches(container)).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length),
    );

    // `PLAN_PUBLISHED` est le premier de la liste, `MESSAGE_RECEIVED` le troisième.
    fireEvent.click(switches(container)[0] as Element);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        enabled: [NotificationType.PLAN_PUBLISHED, NotificationType.MESSAGE_RECEIVED],
      }),
    );
  });

  /**
   * Le contrat de l'optimisme : l'interrupteur suit le doigt, mais REVIENT si l'écriture échoue.
   * Resté allumé sur une écriture perdue, il ferait attendre des e-mails qui ne viendront jamais.
   */
  it("remet l'interrupteur en place quand l'enregistrement échoue", async () => {
    replace.mockRejectedValue(new Error("réseau"));
    const { container } = renderRn(<NotificationEmailSection />);
    await waitFor(() =>
      expect(switches(container)).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length),
    );

    fireEvent.click(switches(container)[0] as Element);

    await waitFor(() => expect((switches(container)[0] as HTMLInputElement).checked).toBe(false));
  });

  // Attendre est MUET, échouer se dit : les deux états ne doivent pas se confondre, sinon une
  // panne de réseau ressemble à un écran qui charge encore.
  it("dit que la lecture a échoué plutôt que de laisser un écran vide", async () => {
    list.mockRejectedValue(new Error("réseau"));
    const { container, queryByText } = renderRn(<NotificationEmailSection />);

    await waitFor(() => expect(queryByText("common.errorTitle")).not.toBeNull());
    expect(switches(container)).toHaveLength(0);
  });

  // « Réessayer » doit vraiment relancer la requête. Un bouton qui ne fait rien est pire qu'un
  // écran d'erreur nu : il fait croire qu'on a essayé.
  it("relance la lecture quand on réessaie", async () => {
    list.mockRejectedValue(new Error("réseau"));
    const { container, queryByText } = renderRn(<NotificationEmailSection />);
    await waitFor(() => expect(queryByText("common.errorTitle")).not.toBeNull());
    const before = list.mock.calls.length;

    list.mockResolvedValue(gridWith([]));
    pressButton(container, "common.retry");

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(switches(container)).toHaveLength(EMAILABLE_NOTIFICATION_TYPES.length),
    );
  });
});

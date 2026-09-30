import * as Notifications from "expo-notifications";
import { describe, expect, it, vi } from "vitest";

await import("./notification");
// Relevé AU CHARGEMENT, comme le handler est posé : le harnais remet les doubles à zéro avant
// chaque test.
const [handler] = vi.mocked(Notifications.setNotificationHandler).mock.calls[0] ?? [];

describe("notification — app ouverte", () => {
  /**
   * Sans ce handler, Android et iOS n'affichent rien au premier plan : le coach qui a l'app ouverte
   * ne verrait jamais passer un débrief. Le badge reste à l'app, qui le compte elle-même.
   */
  it("affiche la notification reçue au premier plan, avec son, sans toucher au badge", async () => {
    if (handler == null) throw new Error("aucun handler posé au chargement");

    const behavior = await handler.handleNotification(
      {} as Parameters<typeof handler.handleNotification>[0],
    );

    expect(behavior).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

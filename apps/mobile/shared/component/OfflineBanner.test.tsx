import { useNetworkState } from "expo-network";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { renderRn } from "@/test/render";
import { OfflineBanner } from "./OfflineBanner";

vi.mock("expo-network", () => ({ useNetworkState: vi.fn() }));
vi.mock("@/shared/util/date.util", () => ({ formatDateTime: (iso: string) => `formaté:${iso}` }));

/** `undefined` = sonde pas encore aboutie : le champ est alors ABSENT de l'état réseau. */
function withReachability(isInternetReachable: boolean | undefined) {
  vi.mocked(useNetworkState).mockReturnValue(
    isInternetReachable == null
      ? { isConnected: true }
      : { isConnected: true, isInternetReachable },
  );
  return renderRn(<OfflineBanner />);
}

describe("OfflineBanner", () => {
  it("prévient que les données sont figées quand internet est injoignable", () => {
    const { queryByText } = withReachability(false);

    expect(queryByText("common.offline")).not.toBeNull();
  });

  /**
   * Au premier rendu, la sonde n'a pas abouti : crier « hors-ligne » sur un « je ne sais pas »
   * serait un faux positif à chaque démarrage.
   */
  it.each([
    ["joignable", true],
    ["indéterminé", undefined],
  ])("reste muet quand internet est %s", (_, reachable) => {
    const { container } = withReachability(reachable);

    expect(container.textContent).toBe("");
  });
});

/**
 * `cimode` perd l'interpolation : la date ne s'affirme que sous une instance qui ÉCRIT ses
 * paramètres, posée par-dessus celle du rendu.
 */
describe("OfflineBanner — daté (#307)", () => {
  function offlineWith(savedAt: string | null) {
    vi.mocked(useNetworkState).mockReturnValue({ isConnected: false, isInternetReachable: false });
    const i18n = createInstance();
    i18n.init({
      lng: "test",
      resources: {
        test: { translation: { common: { offline: "générique", offlineSavedAt: "le {{date}}" } } },
      },
      interpolation: { escapeValue: false },
    });
    return renderRn(
      <I18nextProvider i18n={i18n}>
        <OfflineBanner savedAt={savedAt} />
      </I18nextProvider>,
    );
  }

  it("dit quand le contenu affiché a été récupéré", () => {
    const { queryByText } = offlineWith("2026-08-12T19:04:00.000Z");

    expect(queryByText("le formaté:2026-08-12T19:04:00.000Z")).not.toBeNull();
  });

  it("garde le message générique quand l'écran ne connaît pas la date", () => {
    const { queryByText } = offlineWith(null);

    expect(queryByText("générique")).not.toBeNull();
  });
});

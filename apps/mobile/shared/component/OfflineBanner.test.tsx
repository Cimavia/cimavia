import { useNetworkState } from "expo-network";
import { describe, expect, it, vi } from "vitest";
import { renderRn } from "@/test/render";
import { OfflineBanner } from "./OfflineBanner";

vi.mock("expo-network", () => ({ useNetworkState: vi.fn() }));

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

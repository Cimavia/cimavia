import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BundleUpdateContext } from "@/shared/hook/useBundleUpdate";
import { CmvUpdateBanner } from "./CmvUpdateBanner";

function renderBanner(isAvailable: boolean) {
  return render(
    <BundleUpdateContext value={isAvailable}>
      <CmvUpdateBanner />
    </BundleUpdateContext>,
  );
}

describe("CmvUpdateBanner", () => {
  it("ne dit rien tant qu'aucune nouvelle version n'est en ligne", () => {
    renderBanner(false);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("invite à recharger, et seulement sur clic : aucune saisie ne part sans le Coach", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    renderBanner(true);

    expect(screen.getByRole("status")).toHaveTextContent("common.update.available");
    expect(reload).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: "common.update.reload" }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it("n'offre aucun moyen de la masquer : elle reste jusqu'au rechargement", () => {
    renderBanner(true);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

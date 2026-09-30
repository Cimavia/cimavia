import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CmvCard } from "./CmvCard";

describe("CmvCard", () => {
  it("reste une carte statique sans onClick", () => {
    const { queryByRole, getByText } = render(<CmvCard>Séance</CmvCard>);

    expect(queryByRole("button")).toBeNull();
    expect(getByText("Séance")).toHaveClass("bg-cmv-surface");
  });

  it("devient un bouton qui répond au clic", async () => {
    const onClick = vi.fn();
    const { getByRole } = render(<CmvCard onClick={onClick}>Séance</CmvCard>);

    await userEvent.click(getByRole("button", { name: "Séance" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  /**
   * Le cas qui a motivé la prop : le survol neutre posé sur une carte d'alerte en écrasait le fond,
   * et `cn` ne départage pas deux `bg-*` (cf. `CmvCard.tsx`).
   */
  it("garde la surface d'une carte qui signale, survol compris", () => {
    const { getByRole } = render(
      <CmvCard surfaceClassName="border-cmv-error bg-cmv-error-soft" onClick={() => {}}>
        Retard
      </CmvCard>,
    );

    const card = getByRole("button", { name: "Retard" });
    expect(card).toHaveClass("bg-cmv-error-soft");
    expect(card).not.toHaveClass("bg-cmv-surface", "hover:bg-cmv-surface-hi");
  });
});

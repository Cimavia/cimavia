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

  /**
   * Le marqueur qui distingue à l'œil une carte qui ouvre quelque chose (#703) — seule, une carte
   * cliquable ressemblait trait pour trait à une carte statique.
   */
  describe("le chevron", () => {
    it("marque la carte cliquable, sans s'ajouter à son nom accessible", () => {
      const { getByRole } = render(<CmvCard onClick={() => {}}>Séance</CmvCard>);

      const card = getByRole("button", { name: "Séance" });
      expect(card.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    // Sans lui, une carte d'alerte n'avait AUCUN retour au survol : celui de la surface lui est retiré.
    it("reste sur une carte qui signale", () => {
      const { getByRole } = render(
        <CmvCard surfaceClassName="border-cmv-error bg-cmv-error-soft" onClick={() => {}}>
          Retard
        </CmvCard>,
      );

      expect(getByRole("button", { name: "Retard" }).querySelector("svg")).not.toBeNull();
    });

    it("n'apparaît pas sur une carte statique", () => {
      const { container } = render(<CmvCard>Séance</CmvCard>);

      expect(container.querySelector("svg")).toBeNull();
    });
  });
});

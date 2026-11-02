import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardTile } from "./DashboardTile";

/**
 * Ce que la tuile DÉCIDE : le nombre ou « — », la couleur qu'elle ne prend qu'en signalant, et si
 * elle se montre comme une tuile qui ouvre un écran (#703).
 */
describe("DashboardTile", () => {
  // « — » et non 0 : un zéro rassurerait à tort sur une donnée qu'on n'a pas pu lire.
  it("rend « — » tant que le compte est indisponible, sans colorer", () => {
    const { getByText } = render(
      <DashboardTile label="Débriefs" count={null} hint="à lire" variant="action" tone="warning" />,
    );

    expect(getByText("—")).toHaveClass("text-cmv-text-hi");
  });

  it("colore le chiffre d'une tuile qui a quelque chose à signaler", () => {
    const { getByText } = render(
      <DashboardTile label="Retards" count={2} hint="à relancer" variant="action" tone="error" />,
    );

    expect(getByText("2")).toHaveClass("text-cmv-error-on");
  });

  describe("le marqueur d'ouverture", () => {
    it("se pose sur une tuile qui mène à un écran, et la tuile y mène", async () => {
      const onClick = vi.fn();
      const { getByRole } = render(
        <DashboardTile
          label="Débriefs"
          count={0}
          hint="à lire"
          variant="action"
          tone="warning"
          onClick={onClick}
        />,
      );

      const tile = getByRole("button", { name: /Débriefs/ });
      expect(tile.querySelector("svg")).not.toBeNull();
      await userEvent.click(tile);
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("ne se pose pas sur une tuile de contexte, qui n'ouvre rien", () => {
      const { container, queryByRole } = render(
        <DashboardTile label="Athlètes" count={4} hint="suivis" />,
      );

      expect(queryByRole("button")).toBeNull();
      expect(container.querySelector("svg")).toBeNull();
    });
  });
});

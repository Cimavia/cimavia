import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvAddTile } from "./CmvAddTile";

describe("CmvAddTile", () => {
  it("se nomme par son geste, que l'indice décrit sans s'y mêler", async () => {
    const onClick = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <CmvAddTile label="Ajouter un exercice" hint="crée un bloc Séries" onClick={onClick} />,
    );

    const tile = getByRole("button", { name: "Ajouter un exercice" });
    expect(tile).toHaveAccessibleDescription("crée un bloc Séries");
    await user.click(tile);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("n'a pas de description sans indice", () => {
    const { getByRole } = renderWithProviders(
      <CmvAddTile label="Ajouter un bloc" onClick={vi.fn()} />,
    );

    expect(getByRole("button", { name: "Ajouter un bloc" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });
});

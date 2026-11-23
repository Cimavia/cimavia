import { within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvSegmented } from "./CmvSegmented";

const OPTIONS = [
  { value: "TRAINING", label: "Entraînement" },
  { value: "DELOAD", label: "Décharge" },
] as const;

describe("CmvSegmented", () => {
  it("annonce l'option choisie par son état, pas par sa couleur", () => {
    const { getByRole } = renderWithProviders(
      <CmvSegmented
        ariaLabel="Type de semaine"
        options={[...OPTIONS]}
        value="DELOAD"
        onChange={vi.fn()}
      />,
    );

    expect(getByRole("button", { pressed: true })).toHaveAccessibleName("Décharge");
    expect(getByRole("button", { pressed: false })).toHaveAccessibleName("Entraînement");
  });

  it("sans libellé visible, le groupe porte son aria-label", () => {
    const { getByRole } = renderWithProviders(
      <CmvSegmented
        ariaLabel="Type de semaine"
        options={[...OPTIONS]}
        value="TRAINING"
        onChange={vi.fn()}
      />,
    );

    const group = getByRole("group", { name: "Type de semaine" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
  });

  it("avec un libellé visible, c'est lui qui nomme le groupe", () => {
    const { getByRole, getByText } = renderWithProviders(
      <CmvSegmented label="État" options={[...OPTIONS]} value="TRAINING" onChange={vi.fn()} />,
    );

    expect(getByText("État")).toBeVisible();
    expect(getByRole("group", { name: "État" })).toBeInTheDocument();
  });

  it("nommé par un libellé posé ailleurs, il en reprend le texte", () => {
    const { getByRole } = renderWithProviders(
      <div>
        <span id="direction">Sens</span>
        <CmvSegmented
          ariaLabelledBy="direction"
          options={[...OPTIONS]}
          value="TRAINING"
          onChange={vi.fn()}
        />
      </div>,
    );

    expect(getByRole("group", { name: "Sens" })).toBeInTheDocument();
  });

  it("un clic choisit l'option, et le désactivé n'en choisit aucune", async () => {
    const onChange = vi.fn();
    const { user, getByRole, rerender } = renderWithProviders(
      <CmvSegmented ariaLabel="Type" options={[...OPTIONS]} value="TRAINING" onChange={onChange} />,
    );

    await user.click(getByRole("button", { name: "Décharge" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("DELOAD");

    rerender(
      <CmvSegmented
        ariaLabel="Type"
        options={[...OPTIONS]}
        value="TRAINING"
        onChange={onChange}
        disabled
      />,
    );
    await user.click(getByRole("button", { name: "Décharge" }));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("refuse, au typage, un groupe sans nom", () => {
    // Le contrat est dans le type : ce rendu ne compilerait pas sans la directive — et voici le
    // groupe anonyme qu'il empêche.
    const { getByRole } = renderWithProviders(
      // @ts-expect-error -- ni `label`, ni `ariaLabel`, ni `ariaLabelledBy`
      <CmvSegmented options={[...OPTIONS]} value="TRAINING" onChange={vi.fn()} />,
    );

    expect(getByRole("group")).toHaveAccessibleName("");
  });
});

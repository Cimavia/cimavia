import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvConfirmButton } from "./CmvConfirmButton";

function setup(over: Partial<Parameters<typeof CmvConfirmButton>[0]> = {}) {
  const onConfirm = vi.fn();
  const view = renderWithProviders(
    <CmvConfirmButton
      label="Supprimer"
      confirmLabel="Confirmer"
      cancelLabel="Annuler"
      onConfirm={onConfirm}
      {...over}
    />,
  );
  return { ...view, onConfirm };
}

describe("CmvConfirmButton", () => {
  it("confirme en deux temps", async () => {
    const { user, getByRole, onConfirm } = setup();

    await user.click(getByRole("button", { name: "Supprimer" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(getByRole("button", { name: "Confirmer" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("n'écrit l'avertissement qu'une fois armé", async () => {
    const { user, getByRole, queryByText } = setup({ confirmHint: "L'athlète sera prévenu" });

    expect(queryByText("L'athlète sera prévenu")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: "Supprimer" }));

    expect(queryByText("L'athlète sera prévenu")).toBeInTheDocument();
  });

  /**
   * #313 : la raison posée sur le bouton lui-même ne s'affichait jamais — un bouton désactivé ne
   * reçoit pas le survol, et son propre `title` masquait celui de l'enveloppe. Elle vit donc sur
   * l'enveloppe, et le bouton laisse passer le pointeur jusqu'à elle.
   */
  it("désactive le bouton et porte la raison sur une enveloppe qui reçoit le survol", () => {
    const { getByRole, getByTitle } = setup({ disabledReason: "Séance débriefée" });

    const button = getByRole("button", { name: "Supprimer" });
    expect(button).toBeDisabled();
    const wrapper = getByTitle("Séance débriefée");
    expect(wrapper).toContainElement(button);
    expect(wrapper).toHaveClass("[&>button]:pointer-events-none");
  });
});

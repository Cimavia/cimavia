import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pressButton, renderRn } from "../../test/render";
import { CmvConfirmButton } from "./CmvConfirmButton";

function setup(disabled = false) {
  const onConfirm = vi.fn();
  const { container } = renderRn(
    <CmvConfirmButton
      label="Refuser"
      confirmLabel="Confirmer"
      cancelLabel="Annuler"
      onConfirm={onConfirm}
      disabled={disabled}
    />,
  );
  return { onConfirm, container };
}

describe("CmvConfirmButton", () => {
  /**
   * Toute la valeur du composant tient dans ce test : un seul appui ne déclenche rien. Sans lui,
   * un geste sans retour — refuser une invitation — partirait sur un effleurement.
   */
  it("n'appelle rien au premier appui, et confirme au second", () => {
    const { onConfirm, container } = setup();

    pressButton(container, "Refuser");
    expect(onConfirm).not.toHaveBeenCalled();

    pressButton(container, "Confirmer");
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  // Se raviser doit être aussi facile que confirmer : le bouton revient à son état de repos, et
  // rien n'a été envoyé.
  it("revient au repos quand on annule, sans rien envoyer", () => {
    const { onConfirm, container } = setup();

    pressButton(container, "Refuser");
    pressButton(container, "Annuler");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Refuser")).toBeTruthy();
    expect(screen.queryByText("Confirmer")).toBeNull();
  });

  /**
   * Une mutation en cours désarme le geste des DEUX côtés. Confirmer deux fois enverrait deux
   * refus, dont le second échouerait sur une invitation qui a déjà quitté `PENDING` — une erreur
   * affichée pour une action qui a pourtant réussi.
   */
  it("n'arme ni ne confirme quand il est désactivé", () => {
    const { onConfirm, container } = setup(true);

    pressButton(container, "Refuser");
    expect(screen.queryByText("Confirmer")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

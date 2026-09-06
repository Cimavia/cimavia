import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pressButton, renderRn } from "../../test/render";
import { CmvConfirmButton } from "./CmvConfirmButton";

type Options = {
  disabled?: boolean;
  variant?: "danger" | "secondary" | "ghost";
  confirmHint?: string;
};

/**
 * `confirmHint` est étalé plutôt que passé à `undefined` : `exactOptionalPropertyTypes` distingue
 * la prop ABSENTE de la prop posée à `undefined`, et c'est bien l'absence qu'on veut éprouver —
 * celle des appelants qui n'ont rien à avertir.
 */
function setup({ disabled = false, variant = "danger", confirmHint }: Options = {}) {
  const onConfirm = vi.fn();
  const { container } = renderRn(
    <CmvConfirmButton
      label="Refuser"
      confirmLabel="Confirmer"
      cancelLabel="Annuler"
      onConfirm={onConfirm}
      disabled={disabled}
      variant={variant}
      {...(confirmHint == null ? {} : { confirmHint })}
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
    const { onConfirm, container } = setup({ disabled: true });

    pressButton(container, "Refuser");
    expect(screen.queryByText("Confirmer")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * L'avertissement n'a rien à dire tant que rien n'est engagé : au repos il ajouterait du bruit à
   * un bouton qu'on n'a pas encore touché. Armé, c'est le dernier moment où il peut servir.
   */
  it("n'écrit son avertissement qu'une fois armé", () => {
    const { container } = setup({ confirmHint: "Geste irréversible." });

    expect(screen.queryByText("Geste irréversible.")).toBeNull();

    pressButton(container, "Refuser");
    expect(screen.getByText("Geste irréversible.")).toBeTruthy();
  });

  // Sans avertissement, l'état armé ne fabrique pas de ligne vide au-dessus des deux boutons.
  it("n'affiche aucun avertissement quand il n'y en a pas", () => {
    const { container } = setup();

    pressButton(container, "Refuser");
    expect(screen.getByText("Confirmer")).toBeTruthy();
  });

  /**
   * Les trois habillages protègent le MÊME geste : c'est tout l'intérêt d'une variante plutôt que
   * de trois composants. Un jour où `ghost` cesserait de confirmer, l'annulation d'une facture
   * partirait — ou ne partirait plus — sans que rien d'autre ne bouge.
   */
  it.each([
    "danger",
    "secondary",
    "ghost",
  ] as const)("confirme en deux temps quelle que soit la variante (%s)", (variant) => {
    const { onConfirm, container } = setup({ variant });

    pressButton(container, "Refuser");
    expect(onConfirm).not.toHaveBeenCalled();

    pressButton(container, "Confirmer");
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

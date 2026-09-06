import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvPanel } from "./CmvPanel";

const OUTER = "Facture d'août";
const INNER = "Programmer un rappel";

/**
 * Deux panneaux superposés, montés comme ils le sont en vrai : l'intérieur vit DANS l'arbre de
 * l'extérieur, comme `ScheduleReminderButton` dans le panneau de détail d'une facture.
 */
function NestedPanels({ onOuterClose }: Readonly<{ onOuterClose: () => void }>) {
  const [innerOpen, setInnerOpen] = useState(false);

  return (
    <CmvPanel open title={OUTER} onClose={onOuterClose}>
      <button type="button" onClick={() => setInnerOpen(true)}>
        Ouvrir le rappel
      </button>
      <CmvPanel open={innerOpen} title={INNER} onClose={() => setInnerOpen(false)}>
        <p>Note du rappel</p>
      </CmvPanel>
    </CmvPanel>
  );
}

describe("CmvPanel", () => {
  it("ne rend rien tant qu'il est fermé", () => {
    const { queryByRole } = renderWithProviders(
      <CmvPanel open={false} title={OUTER} onClose={() => {}}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(queryByRole("complementary", { name: OUTER })).toBeNull();
  });

  it("ferme sur Échap quand il est seul", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={onClose}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ferme au clic sur le fond", async () => {
    const onClose = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={onClose}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    await user.click(getByRole("button", { name: "Fermer" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * LE cas qui justifie la pile. Sans elle, les deux panneaux posent leur écouteur sur `window`,
   * les deux sont appelés, et annuler le rappel referme la facture qu'on lisait derrière.
   */
  it("ne ferme que le panneau du dessus quand deux se superposent", async () => {
    const onOuterClose = vi.fn();
    const { user, getByRole, queryByRole } = renderWithProviders(
      <NestedPanels onOuterClose={onOuterClose} />,
    );

    await user.click(getByRole("button", { name: "Ouvrir le rappel" }));
    expect(getByRole("complementary", { name: INNER })).toBeTruthy();

    await user.keyboard("{Escape}");

    // Le rappel est parti…
    expect(queryByRole("complementary", { name: INNER })).toBeNull();
    // …et la facture est restée.
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(getByRole("complementary", { name: OUTER })).toBeTruthy();
  });

  it("rend Échap au panneau du dessous une fois celui du dessus refermé", async () => {
    const onOuterClose = vi.fn();
    const { user, getByRole } = renderWithProviders(<NestedPanels onOuterClose={onOuterClose} />);

    await user.click(getByRole("button", { name: "Ouvrir le rappel" }));
    await user.keyboard("{Escape}{Escape}");

    // Le second Échap trouve la pile dépilée : c'est la facture qui répond.
    expect(onOuterClose).toHaveBeenCalledOnce();
  });

  /**
   * Les appelants passent tous une flèche EN LIGNE à `onClose`. Si l'effet en dépendait, chaque
   * rendu dépilerait puis réempilerait le panneau — et un panneau que rien n'a rouvert repasserait
   * devant celui du dessus.
   */
  it("garde son rang dans la pile quand le panneau du dessous se re-rend", async () => {
    const onOuterClose = vi.fn();

    function ReRendering() {
      const [, bump] = useState(0);
      return (
        <>
          <button type="button" onClick={() => bump((count) => count + 1)}>
            Re-rendre
          </button>
          <NestedPanels onOuterClose={onOuterClose} />
        </>
      );
    }

    const { user, getByRole, queryByRole } = renderWithProviders(<ReRendering />);

    await user.click(getByRole("button", { name: "Ouvrir le rappel" }));
    await user.click(getByRole("button", { name: "Re-rendre" }));
    await user.keyboard("{Escape}");

    expect(queryByRole("complementary", { name: INNER })).toBeNull();
    expect(onOuterClose).not.toHaveBeenCalled();
  });
});

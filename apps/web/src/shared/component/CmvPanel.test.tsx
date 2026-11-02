import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
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

    await user.click(getByRole("button", { name: "common.close" }));

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

describe("CmvPanel — la largeur réglable (#695)", () => {
  // Les huit usages d'avant n'en passent pas : ni poignée, ni largeur imposée.
  it("n'a pas de poignée sans largeur", () => {
    const { queryByRole, getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(queryByRole("separator")).toBeNull();
    expect(getByRole("complementary", { name: OUTER })).toHaveClass("max-w-xl");
  });

  it("s'élargit par la poignée de son bord gauche", async () => {
    const onWidthChange = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}} width={576} onWidthChange={onWidthChange}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(getByRole("separator")).toHaveAttribute("aria-valuenow", "576");
    getByRole("separator").focus();
    await user.keyboard("{ArrowLeft}");

    expect(onWidthChange).toHaveBeenCalledWith(592);
  });

  // Enregistrée sur un grand écran : ramenée à la fenêtre (1024 px sous jsdom), fond compris.
  it("ramène une largeur trop grande à la fenêtre", () => {
    const { getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}} width={2000} onWidthChange={() => {}}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(getByRole("separator")).toHaveAttribute("aria-valuenow", String(window.innerWidth - 48));
  });

  // Le panneau suit le pointeur seul : l'appelant n'apprend la largeur qu'au relâchement.
  it("ne rend la largeur qu'à la fin du geste", () => {
    const onWidthChange = vi.fn();
    const { getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}} width={576} onWidthChange={onWidthChange}>
        <p>Contenu</p>
      </CmvPanel>,
    );
    const edge = getByRole("separator");

    fireEvent.pointerDown(edge, { button: 0, buttons: 1, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(edge, { buttons: 1, pointerId: 1, clientX: 400 });
    expect(edge).toHaveAttribute("aria-valuenow", "676");
    expect(onWidthChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(edge, { pointerId: 1 });
    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(676);
  });

  // Plus étroite que le minimum et la bande de fond réunis : la bande reste, le panneau cède.
  it("garde une bande de fond dans une fenêtre étroite", () => {
    const innerWidth = window.innerWidth;
    window.innerWidth = 300;
    onTestFinished(() => {
      window.innerWidth = innerWidth;
    });
    const { getByRole } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}} width={576} onWidthChange={() => {}}>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(getByRole("separator")).toHaveAttribute("aria-valuenow", "252");
    expect(getByRole("separator")).toHaveAttribute("aria-valuemin", "252");
  });

  it("rend son corps sans marge sur demande", () => {
    const { getByText } = renderWithProviders(
      <CmvPanel open title={OUTER} onClose={() => {}} flush>
        <p>Contenu</p>
      </CmvPanel>,
    );

    expect(getByText("Contenu").parentElement).not.toHaveClass("p-cmv-xl");
  });
});

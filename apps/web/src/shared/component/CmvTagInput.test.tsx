import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvTagInput } from "./CmvTagInput";

const LABEL = "shared.tags.label";
const REMOVE = "shared.tags.remove";

function setup(props: Partial<Parameters<typeof CmvTagInput>[0]> = {}) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <CmvTagInput label={LABEL} removeLabel={REMOVE} value={[]} onChange={onChange} {...props} />,
  );
  return { ...view, onChange, input: view.getByLabelText(LABEL) };
}

describe("CmvTagInput", () => {
  it("normalise le tag avant de le poser", async () => {
    const { user, input, onChange } = setup();

    await user.type(input, "  Renfo  {Enter}");

    // La casse et les espaces disparaissent ICI et pas chez l'appelant : c'est ce qui permet à la
    // déduplication de voir « Renfo » et « renfo » comme le même tag.
    expect(onChange).toHaveBeenCalledWith(["renfo"]);
  });

  it("accepte aussi la virgule comme séparateur", async () => {
    const { user, input, onChange } = setup();

    await user.type(input, "gainage,");

    expect(onChange).toHaveBeenCalledWith(["gainage"]);
  });

  it("vide le champ sans rien signaler quand le tag est déjà posé", async () => {
    const { user, input, onChange } = setup({ value: ["renfo"] });

    await user.type(input, "RENFO{Enter}");

    // Un doublon n'est pas une erreur : l'intention de l'utilisateur est déjà satisfaite. Ce qui
    // se vérifie est donc l'ABSENCE de notification, pas un message.
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("ignore une saisie qui ne contient que des espaces", async () => {
    const { user, input, onChange } = setup();

    await user.type(input, "   {Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("pose le brouillon quand le champ perd le focus", async () => {
    const { user, input, onChange } = setup();

    await user.type(input, "souplesse");
    await user.tab();

    // Sans ça, un tag tapé puis abandonné pour cliquer « Enregistrer » serait silencieusement
    // perdu — l'utilisateur croit l'avoir posé, il le voit à l'écran, et il ne part pas.
    expect(onChange).toHaveBeenCalledWith(["souplesse"]);
  });

  it("retire le dernier tag au retour arrière sur un champ vide", async () => {
    const { user, input, onChange } = setup({ value: ["renfo", "gainage"] });

    await user.type(input, "{Backspace}");

    expect(onChange).toHaveBeenCalledWith(["renfo"]);
  });

  it("ne retire rien au retour arrière si le champ contient du texte", async () => {
    const { user, input, onChange } = setup({ value: ["renfo"] });

    await user.type(input, "ga{Backspace}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ferme la saisie une fois le plafond atteint", () => {
    const { input } = setup({ value: ["renfo", "gainage"], max: 2 });

    // Désactivé plutôt que « refusé à la validation » : un champ qui accepte la frappe et jette
    // le résultat ne dit jamais POURQUOI le tag n'apparaît pas.
    expect(input).toBeDisabled();
  });

  it("retire le tag désigné par sa croix", async () => {
    const { user, onChange, getByRole } = setup({ value: ["renfo", "gainage"] });

    await user.click(getByRole("button", { name: `${REMOVE} renfo` }));

    expect(onChange).toHaveBeenCalledWith(["gainage"]);
  });

  describe("suggestions", () => {
    const suggestions = ["renfo", "gainage", "grimpe"];

    it("ne propose pas ce qui est déjà posé", () => {
      const { container } = setup({ value: ["renfo"], suggestions });

      expect(optionValues(container)).toEqual(["gainage", "grimpe"]);
    });

    it("filtre sur la saisie normalisée", async () => {
      const { user, input, container } = setup({ suggestions });

      await user.type(input, "GR");

      // La saisie passe par `normalize` avant la comparaison : sans ça, taper en majuscules ne
      // proposerait jamais rien, alors que le tag posé serait bien reconnu.
      expect(optionValues(container)).toEqual(["grimpe"]);
    });
  });
});

/** Les suggestions vivent dans un `datalist` : aucun rôle ARIA ne les expose, d'où la requête DOM. */
function optionValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("datalist option")).map((option) =>
    option.getAttribute("value"),
  ) as string[];
}

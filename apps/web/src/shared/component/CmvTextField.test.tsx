import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvTextField } from "./CmvTextField";

const LABEL = "invoice.billing.amount";

function setup(props: Partial<Parameters<typeof CmvTextField>[0]> = {}) {
  return renderWithProviders(<CmvTextField label={LABEL} name="amount" {...props} />);
}

describe("CmvTextField", () => {
  it("laisse le nom accessible du champ intact quand il porte le repère", () => {
    const { getByRole } = setup({ required: true, requiredMark: true });

    // LE point de cette prop. L'astérisque vit DANS le `<label>` : sans `aria-hidden`, il entre
    // dans le nom calculé et le champ s'annonce « invoice.billing.amount astérisque ».
    expect(getByRole("textbox", { name: LABEL })).toBeTruthy();
  });

  it("montre le repère à l'œil, et laisse `required` porter l'obligation", () => {
    const { getByRole, getByText } = setup({ required: true, requiredMark: true });

    // Le repère est visible…
    expect(getByText("*")).toBeTruthy();
    // …et n'est PAS ce qui dit au lecteur d'écran que le champ est obligatoire.
    expect(getByRole("textbox", { name: LABEL })).toBeRequired();
  });

  it("n'affiche aucun repère sans la prop", () => {
    const { queryByText } = setup({ required: true });

    // `required` seul ne marque rien : les formulaires dont TOUT est obligatoire restent nus.
    expect(queryByText("*")).toBeNull();
  });
});

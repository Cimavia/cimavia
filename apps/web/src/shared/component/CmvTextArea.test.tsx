import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvTextArea } from "./CmvTextArea";

const LABEL = "plan.header.descriptionLabel";

function setup(props: Partial<Parameters<typeof CmvTextArea>[0]> = {}) {
  return renderWithProviders(
    <CmvTextArea label={LABEL} name="description" onChange={() => {}} {...props} />,
  );
}

describe("CmvTextArea", () => {
  it("passe sa borne au champ, qui arrête la saisie", () => {
    const { getByRole } = setup({ value: "", maxLength: 100 });

    expect(getByRole("textbox", { name: LABEL })).toHaveAttribute("maxLength", "100");
  });

  it("tait le compteur loin de la borne", () => {
    const { queryByText } = setup({ value: "x".repeat(89), maxLength: 100 });

    expect(queryByText("common.charCount")).not.toBeInTheDocument();
  });

  it("montre le compteur à l'approche de la borne (#319)", () => {
    const { getByText } = setup({ value: "x".repeat(90), maxLength: 100 });

    expect(getByText("common.charCount")).toBeInTheDocument();
  });

  it("n'a pas de compteur sans borne, quelle que soit la longueur", () => {
    const { queryByText } = setup({ value: "x".repeat(10_000) });

    expect(queryByText("common.charCount")).not.toBeInTheDocument();
  });

  it("compte une valeur absente comme vide", () => {
    const { queryByText } = setup({ maxLength: 1 });

    expect(queryByText("common.charCount")).not.toBeInTheDocument();
  });
});

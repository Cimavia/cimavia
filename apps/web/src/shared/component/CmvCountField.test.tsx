import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvCountField } from "./CmvCountField";

const LABEL = "Nombre de tours";

function setup(value = 4) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <CmvCountField label={LABEL} unit="tours" value={value} onChange={onChange} min={1} max={99} />,
  );
  return { ...view, onChange, input: view.getByLabelText(LABEL) as HTMLInputElement };
}

describe("CmvCountField", () => {
  it("affiche le nombre reçu et ce qu'il compte", () => {
    const { input, getByText } = setup(8);

    expect(input).toHaveValue("8");
    expect(getByText("tours")).toBeInTheDocument();
  });

  it("propage un nombre entier dans ses bornes, à la sortie du champ", async () => {
    const { user, input, onChange } = setup();

    await user.clear(input);
    await user.type(input, "12");
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(12);
  });

  it.each(["", "0", "100", "2,5", "abc"])("refuse « %s » et le laisse à l'écran", async (text) => {
    const { user, input, onChange, getByText } = setup();

    await user.clear(input);
    if (text !== "") await user.type(input, text);
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(text);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(getByText("common.countOutOfBounds")).toBeInTheDocument();
  });
});

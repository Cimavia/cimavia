import { formatTrainingDuration } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvDurationField } from "./CmvDurationField";

const LABEL = "Repos";

function setup(value: number | null = 90) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <CmvDurationField label={LABEL} value={value} onChange={onChange} />,
  );
  return { ...view, onChange, input: view.getByLabelText(LABEL) as HTMLInputElement };
}

describe("CmvDurationField", () => {
  it("affiche la durée reçue mise en forme", () => {
    const { input } = setup(150);

    expect(input).toHaveValue(formatTrainingDuration(150));
  });

  it("ne propage rien quand on quitte le champ sans l'avoir touché", async () => {
    const { user, input, onChange } = setup();

    await user.click(input);
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ne propage qu'à la validation, pas à chaque frappe", async () => {
    const { user, input, onChange } = setup(null);

    await user.type(input, "2:30");
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith(150);
  });

  it("remonte null quand le champ est vidé", async () => {
    const { user, input, onChange } = setup(90);

    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("garde une saisie refusée à l'écran et dit ce qu'on attend", async () => {
    const { user, input, onChange, getByText } = setup(90);

    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    // Pas de retour silencieux à l'ancienne valeur : le coach verrait sa saisie disparaître.
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("abc");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("common.durationInvalid");
    expect(getByText("common.durationInvalid")).toBeInTheDocument();
  });

  it("lève l'alerte dès que la saisie redevient valide", async () => {
    const { user, input, onChange, queryByText } = setup(90);
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    await user.clear(input);
    await user.type(input, "45{Enter}");

    expect(onChange).toHaveBeenCalledWith(45);
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(queryByText("common.durationInvalid")).toBeNull();
  });
});

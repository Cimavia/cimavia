import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvToggleChip } from "./CmvToggleChip";

describe("CmvToggleChip", () => {
  it("dit son état et le bascule au clic", async () => {
    const onToggle = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <CmvToggleChip pressed onToggle={onToggle}>
        Les miens
      </CmvToggleChip>,
    );

    const chip = getByRole("button", { name: "Les miens" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.click(chip);

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("inactive, elle n'affiche pas de coche", () => {
    const { getByRole } = renderWithProviders(
      <CmvToggleChip pressed={false} onToggle={vi.fn()}>
        Partagés
      </CmvToggleChip>,
    );

    const chip = getByRole("button", { name: "Partagés" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.querySelector("svg")).toBeNull();
  });

  it("verrouillée, elle ne bascule plus, mais reste atteignable et dit pourquoi", async () => {
    const onToggle = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <CmvToggleChip pressed locked="Au moins une" onToggle={onToggle}>
        Les miens
      </CmvToggleChip>,
    );

    const chip = getByRole("button", { name: "Les miens" });
    await user.click(chip);

    expect(onToggle).not.toHaveBeenCalled();
    expect(chip).toBeEnabled();
    expect(chip).toHaveAttribute("aria-disabled", "true");
    expect(chip).toHaveAttribute("title", "Au moins une");
  });
});

import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { press, renderRn } from "../../test/render";
import { CmvToggleChip } from "./CmvToggleChip";

describe("CmvToggleChip", () => {
  it.each([true, false])("dit son état choisi (%s) et remonte l'appui", (pressed) => {
    const onToggle = vi.fn();
    const { container } = renderRn(
      <CmvToggleChip pressed={pressed} onToggle={onToggle} label="Débriefs" />,
    );

    expect(screen.getByRole("radio", { name: "Débriefs" }).getAttribute("aria-checked")).toBe(
      String(pressed),
    );
    press(within(container).getByRole("radio", { name: "Débriefs" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

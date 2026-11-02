import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pressButton, renderRn } from "../../test/render";
import { CmvToggleChip } from "./CmvToggleChip";

describe("CmvToggleChip", () => {
  it.each([true, false])("dit son état choisi (%s) et remonte l'appui", (pressed) => {
    const onToggle = vi.fn();
    const { container } = renderRn(
      <CmvToggleChip pressed={pressed} onToggle={onToggle} label="Débriefs" />,
    );

    expect(screen.getByRole("button", { name: "Débriefs" }).getAttribute("aria-selected")).toBe(
      String(pressed),
    );
    pressButton(container, "Débriefs");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

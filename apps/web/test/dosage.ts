import { within } from "@testing-library/react";

/** Les cellules d'une ligne de Dosage : ses boutons, sans celui de son menu. */
export const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole("button")
    .filter((button) => !button.hasAttribute("aria-haspopup"));

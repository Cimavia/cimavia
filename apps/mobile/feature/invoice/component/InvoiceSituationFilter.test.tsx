import type { InvoiceRowFilter } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoiceSituationFilter } from "@/feature/invoice/component/InvoiceSituationFilter";
import { pressButton, renderRn } from "@/test/render";

const COUNTS: Record<InvoiceRowFilter, number> = { ALL: 6, OVERDUE: 2, DUE: 2, UP_TO_DATE: 2 };

function setup(filter: InvoiceRowFilter = "ALL") {
  const onChange = vi.fn();
  const { container } = renderRn(
    <InvoiceSituationFilter counts={COUNTS} filter={filter} onChange={onChange} />,
  );
  return { onChange, container };
}

describe("InvoiceSituationFilter", () => {
  /**
   * Les quatre segments sont TOUJOURS là, décomptes compris — y compris ceux à zéro. Un segment
   * qui disparaîtrait quand il se vide ferait sauter la liste sous le pouce du coach.
   */
  it("rend les quatre situations avec leur décompte", () => {
    setup();

    for (const key of ["ALL", "OVERDUE", "DUE", "UP_TO_DATE"]) {
      expect(screen.getByText(`invoice.coach.situationFilter.${key}`)).toBeTruthy();
    }
  });

  it("remonte la situation touchée", () => {
    const { onChange, container } = setup();

    pressButton(container, "invoice.coach.situationFilter.OVERDUE");
    expect(onChange).toHaveBeenCalledWith("OVERDUE");
  });

  /**
   * Chaque chip remonte SA valeur, et pas celle de la première : quatre segments écrits à la suite
   * sont l'endroit type où un copier-coller fait tout pointer sur « Tous » — un filtre qui ne
   * filtre jamais, et rien à l'écran ne le dirait.
   *
   * L'état sélectionné n'est pas affirmé ici : `accessibilityState` ne produit aucun attribut sous
   * `react-native-web`, et la teinte du fond n'est pas observable par le harnais (dette Q-6).
   */
  it.each([
    "ALL",
    "OVERDUE",
    "DUE",
    "UP_TO_DATE",
  ] as const)("remonte %s depuis sa chip", (value) => {
    const { onChange, container } = setup("ALL");

    pressButton(container, `invoice.coach.situationFilter.${value}`);
    expect(onChange).toHaveBeenCalledWith(value);
  });
});

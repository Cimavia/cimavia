import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CmvProgressBar } from "./CmvProgressBar";

/**
 * La valeur ANNONCÉE de la barre, quelle que soit sa forme : `aria-valuenow` sur un élément
 * générique, `value` sur un `<progress>` natif. #504 (S6819) passera la barre au second — ce test
 * affirme ce que lit un lecteur d'écran, pas l'attribut qui le porte.
 */
function announcedValue(element: HTMLElement): number {
  return Number(element.getAttribute("aria-valuenow") ?? element.getAttribute("value"));
}

describe("CmvProgressBar", () => {
  it.each([
    [42, 42],
    [140, 100],
    [-5, 0],
  ])("annonce %s %% comme %s, borné à 0–100", (percent, expected) => {
    const { getByLabelText } = render(<CmvProgressBar percent={percent} label="Envoi du PDF" />);

    expect(announcedValue(getByLabelText("Envoi du PDF"))).toBe(expected);
  });
});

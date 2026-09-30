import { describe, expect, it } from "vitest";
import { renderRn } from "@/test/render";
import { CmvTextField } from "./CmvTextField";

describe("CmvTextField", () => {
  it("pose son libellé au-dessus d'un champ d'une ligne par défaut", () => {
    const { container, getByText } = renderRn(<CmvTextField label="E-mail" value="" />);

    expect(getByText("E-mail")).toBeTruthy();
    expect(container.querySelector("input")).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("devient une zone de texte quand il est multiligne", () => {
    const { container } = renderRn(<CmvTextField label="Débrief" value="" multiline />);

    expect(container.querySelector("textarea")).not.toBeNull();
  });
});

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

describe("CmvTextField — compteur (#319)", () => {
  const COUNT = "common.charCount";

  it("passe sa borne au champ, qui arrête la saisie", () => {
    const { container } = renderRn(
      <CmvTextField label="Débrief" value="" multiline maxLength={100} />,
    );

    expect(container.querySelector("textarea")?.getAttribute("maxLength")).toBe("100");
  });

  it("tait le compteur loin de la borne", () => {
    const { queryByText } = renderRn(
      <CmvTextField label="Débrief" value={"x".repeat(89)} multiline maxLength={100} />,
    );

    expect(queryByText(COUNT)).toBeNull();
  });

  it("montre le compteur à l'approche de la borne", () => {
    const { getByText } = renderRn(
      <CmvTextField label="Débrief" value={"x".repeat(90)} multiline maxLength={100} />,
    );

    expect(getByText(COUNT)).toBeTruthy();
  });

  it("compte une valeur absente comme vide", () => {
    const { queryByText } = renderRn(<CmvTextField label="Débrief" multiline maxLength={1} />);

    expect(queryByText(COUNT)).toBeNull();
  });

  it("n'en a pas sur un champ d'une ligne, ni sans borne", () => {
    const single = renderRn(<CmvTextField label="Titre" value={"x".repeat(10)} maxLength={10} />);
    expect(single.queryByText(COUNT)).toBeNull();
    single.unmount();

    const unbounded = renderRn(
      <CmvTextField label="Débrief" value={"x".repeat(10_000)} multiline />,
    );
    expect(unbounded.queryByText(COUNT)).toBeNull();
  });
});

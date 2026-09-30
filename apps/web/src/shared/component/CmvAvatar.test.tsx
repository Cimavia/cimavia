import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CmvAvatar } from "./CmvAvatar";

describe("CmvAvatar", () => {
  it("affiche les initiales du nom quand il n'y a pas de photo", () => {
    const { container } = render(<CmvAvatar name="Léa Martin" />);

    expect(container).toHaveTextContent("LM");
    expect(container.querySelector("img")).toBeNull();
  });

  it("préfère la photo aux initiales, sans l'annoncer une seconde fois", () => {
    const { container } = render(
      <CmvAvatar name="Léa Martin" imageUrl="https://s3.test/lea.jpg" />,
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://s3.test/lea.jpg");
    // Le nom est écrit à côté de la pastille : l'image n'a rien à dire de plus.
    expect(img).toHaveAttribute("alt", "");
    expect(container).not.toHaveTextContent("LM");
  });
});

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CmvArchiveList } from "./CmvArchiveList";

const ITEMS = [
  {
    id: "rel_1",
    name: "Léa",
    detail: "Suivi terminé le 20 nov. 2026",
    actions: <span>Relire</span>,
  },
];

describe("CmvArchiveList", () => {
  it("se replie par défaut, sans lignes ni cible ARIA absente du DOM", () => {
    const { getByRole, queryByText } = render(<CmvArchiveList title="Suivis" items={ITEMS} />);

    const toggle = getByRole("button", { name: "Suivis" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("aria-controls");
    expect(queryByText("Léa")).toBeNull();
  });

  it("dépliée, désigne la liste qu'elle montre", async () => {
    const { getByRole, getByText } = render(<CmvArchiveList title="Suivis" items={ITEMS} />);
    const toggle = getByRole("button", { name: "Suivis" });

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(list).toContainElement(getByText("Léa"));
    expect(getByText("Suivi terminé le 20 nov. 2026")).toBeInTheDocument();
  });

  it("ne rend rien sans ligne", () => {
    const { container } = render(<CmvArchiveList title="Suivis" items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

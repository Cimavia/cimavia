import { readScheduledBlocks } from "@cmv/shared";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockRailSection } from "@/feature/plan/component/BlockRailSection";
import { blockSession } from "../../../../test/block-session";
import { renderWithProviders } from "../../../../test/render";

const blocks = readScheduledBlocks(blockSession());

function rail(selected: string | null, handlers = { onSelect: vi.fn(), onToggle: vi.fn() }) {
  renderWithProviders(
    <BlockRailSection blocks={blocks} tracking={{}} selected={selected} {...handlers} />,
  );
  return handlers;
}

describe("BlockRailSection", () => {
  it("liste les blocs en liens vers leur ancre, le libellé pour un bloc sans numéro", () => {
    rail(null);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#block-blk-1",
      "#block-blk-2",
      "#block-blk-3",
    ]);
    expect(screen.getByText("Finisher")).toBeTruthy();
    expect(screen.getByText("Séries")).toBeTruthy();
  });

  it("invite à choisir un bloc tant qu'aucun ne l'est", () => {
    rail(null);

    expect(screen.getByText("plan.athlete.blocks.choose")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("choisit le bloc dont on suit le lien", () => {
    const { onSelect } = rail(null);

    fireEvent.click(screen.getByText("Tabata"));

    expect(onSelect).toHaveBeenCalledWith("blk-3");
  });

  it("ouvre les cases du bloc choisi, et remonte la coche sous ce bloc", () => {
    const { onToggle } = rail("blk-3");

    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);

    expect(screen.queryByText("plan.athlete.blocks.choose")).toBeNull();
    expect(onToggle).toHaveBeenCalledWith("blk-3", { key: "c1", row: 0 });
  });
});

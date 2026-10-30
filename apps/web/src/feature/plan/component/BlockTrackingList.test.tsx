import { readScheduledBlocks } from "@cmv/shared";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockTrackingList } from "@/feature/plan/component/BlockTrackingList";
import { blockSession } from "../../../../test/block-session";
import { renderWithProviders } from "../../../../test/render";

function readOf(index: number) {
  const read = readScheduledBlocks(blockSession())[index];
  if (read == null) throw new Error("bloc absent de la fixture");
  return read;
}

describe("BlockTrackingList", () => {
  it("donne une case par série, et remonte celle qu'on coche", () => {
    const onToggle = vi.fn();
    renderWithProviders(<BlockTrackingList read={readOf(0)} tracking={null} onToggle={onToggle} />);

    const boxes = screen.getAllByRole("button");
    expect(boxes).toHaveLength(4);
    fireEvent.click(boxes[1] as HTMLElement);

    expect(onToggle).toHaveBeenCalledWith({ key: "a1", row: 1 });
  });

  it("dit coché ce qui l'est, la note du suivi en dessous", () => {
    renderWithProviders(
      <BlockTrackingList
        read={readOf(0)}
        tracking={{ checked: [{ key: "a1", row: 0 }] }}
        onToggle={vi.fn()}
      />,
    );

    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(screen.getByText(/block\.tally\.note/)).toBeTruthy();
  });

  it("n'a qu'une case « Bloc fait » pour un autant que possible", () => {
    renderWithProviders(<BlockTrackingList read={readOf(1)} tracking={null} onToggle={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("plan.athlete.blocks.blockDone")).toBeTruthy();
  });

  it("dit coché le bloc fait", () => {
    renderWithProviders(
      <BlockTrackingList
        read={readOf(1)}
        tracking={{ checked: [{ key: null, row: 0 }] }}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });
});

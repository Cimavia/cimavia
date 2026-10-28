import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackBlocksSection } from "@/feature/feedback/component/FeedbackBlocksSection";
import { blockSession } from "../../../../test/block-session";
import { renderWithProviders } from "../../../../test/render";

const allSets = [0, 1, 2, 3].map((row) => ({ key: "a1", row }));

describe("FeedbackBlocksSection", () => {
  it("rappelle chaque bloc, et dit « pas de décompte » de ceux où rien n'est coché", () => {
    renderWithProviders(
      <FeedbackBlocksSection
        session={blockSession()}
        tracking={{ "blk-1": { checked: allSets } }}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Séries")).toBeTruthy();
    expect(screen.getByText("Finisher")).toBeTruthy();
    expect(screen.getByText("block.tally.done")).toBeTruthy();
    expect(screen.getAllByText("feedback.tracking.untracked")).toHaveLength(2);
  });

  it("rouvre les cases d'un bloc au crayon, et remonte la coche sous ce bloc", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <FeedbackBlocksSection session={blockSession()} tracking={{}} onToggle={onToggle} />,
    );

    const [pencil] = screen.getAllByLabelText("feedback.tracking.edit");
    fireEvent.click(pencil as HTMLElement);
    expect(pencil?.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getAllByRole("button", { pressed: false })[0] as HTMLElement);

    expect(onToggle).toHaveBeenCalledWith("blk-1", { key: "a1", row: 0 });
  });

  it("referme le bloc rouvert", () => {
    renderWithProviders(
      <FeedbackBlocksSection session={blockSession()} tracking={{}} onToggle={vi.fn()} />,
    );

    const [pencil] = screen.getAllByLabelText("feedback.tracking.edit");
    fireEvent.click(pencil as HTMLElement);
    fireEvent.click(pencil as HTMLElement);

    expect(screen.queryAllByRole("button", { pressed: false })).toHaveLength(0);
  });
});

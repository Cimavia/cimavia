import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackBlocksSection } from "@/feature/feedback/component/FeedbackBlocksSection";
import { blockSession } from "@/test/block-session";
import { press, renderRn } from "@/test/render";

const allSets = [0, 1, 2, 3].map((row) => ({ key: "a1", row }));

describe("FeedbackBlocksSection", () => {
  it("rappelle chaque bloc, et dit « pas de décompte » de ceux où rien n'est coché", () => {
    renderRn(
      <FeedbackBlocksSection
        session={blockSession()}
        tracking={{ "blk-1": { checked: allSets } }}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Séries")).toBeTruthy();
    expect(screen.getByText("block.tally.done")).toBeTruthy();
    expect(screen.getAllByText("feedback.tracking.untracked")).toHaveLength(2);
  });

  it("déplie les cases d'un bloc pour corriger, et remonte la coche sous ce bloc", () => {
    const onToggle = vi.fn();
    renderRn(<FeedbackBlocksSection session={blockSession()} tracking={{}} onToggle={onToggle} />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    press(screen.getAllByLabelText("feedback.tracking.edit")[0] as HTMLElement);
    press(screen.getAllByRole("checkbox")[0] as HTMLElement);

    expect(onToggle).toHaveBeenCalledWith("blk-1", { key: "a1", row: 0 });
    expect(screen.getByText("feedback.tracking.close")).toBeTruthy();
  });

  it("referme le bloc déplié", () => {
    renderRn(<FeedbackBlocksSection session={blockSession()} tracking={{}} onToggle={vi.fn()} />);

    const [first] = screen.getAllByLabelText("feedback.tracking.edit");
    press(first as HTMLElement);
    press(first as HTMLElement);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

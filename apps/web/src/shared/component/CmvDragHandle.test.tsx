import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CmvDragHandle } from "./CmvDragHandle";

function setup() {
  const onMove = vi.fn();
  const view = render(
    <CmvDragHandle label="Déplacer" onDragStart={() => {}} onDragEnd={() => {}} onMove={onMove} />,
  );
  const handle = view.getByRole("button", { name: "Déplacer" });
  handle.focus();
  return { onMove };
}

describe("CmvDragHandle — au clavier", () => {
  it("monte d'un cran sur flèche haut, descend sur flèche bas", async () => {
    const { onMove } = setup();

    await userEvent.keyboard("{ArrowUp}{ArrowDown}");

    expect(onMove.mock.calls).toEqual([[-1], [1]]);
  });

  it("laisse passer les autres touches sans rien déplacer", async () => {
    const { onMove } = setup();

    await userEvent.keyboard("{ArrowLeft}a{Enter}");

    expect(onMove).not.toHaveBeenCalled();
  });
});

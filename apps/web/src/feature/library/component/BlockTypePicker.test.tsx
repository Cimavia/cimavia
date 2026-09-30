import { BlockType } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockTypePicker } from "./BlockTypePicker";

describe("BlockTypePicker", () => {
  it("propose les cinq structures, chacune avec son explication, dans l'ordre", () => {
    const { getAllByRole } = renderWithProviders(<BlockTypePicker onPickType={vi.fn()} />);

    expect(getAllByRole("button").map((button) => button.textContent)).toEqual(
      [BlockType.SERIES, BlockType.EMOM, BlockType.AMRAP, BlockType.CIRCUIT, BlockType.FREE].map(
        (type) => `library.builder.blockType.${type}library.builder.blockTypeHint.${type}`,
      ),
    );
  });

  it.each(Object.values(BlockType))("remonte la structure %s choisie", async (type) => {
    const onPickType = vi.fn();
    const { user, getByRole } = renderWithProviders(<BlockTypePicker onPickType={onPickType} />);

    await user.click(getByRole("button", { name: new RegExp(`blockType\\.${type}`) }));

    expect(onPickType).toHaveBeenCalledExactlyOnceWith(type);
  });
});

import { readScheduledBlocks } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { blockSession } from "@/test/block-session";
import { press, renderRn } from "@/test/render";
import { BlockTrackingList } from "./BlockTrackingList";

function readOf(index: number) {
  const read = readScheduledBlocks(blockSession())[index];
  if (read == null) throw new Error("bloc absent de la fixture");
  return read;
}

const series = readOf(0);
const amrap = readOf(1);
const tabata = readOf(2);

describe("BlockTrackingList", () => {
  it("donne une case par série d'un bloc à un exercice", () => {
    renderRn(<BlockTrackingList read={series} tracking={null} onToggle={vi.fn()} />);
    // Les Séries de la fixture font 4 tours.
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("ne donne que « Bloc fait » à un autant que possible", () => {
    renderRn(<BlockTrackingList read={amrap} tracking={null} onToggle={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByLabelText("plan.blocks.blockDone")).toBeTruthy();
  });

  it("nomme chaque case par le code de son exercice", () => {
    renderRn(<BlockTrackingList read={tabata} tracking={null} onToggle={vi.fn()} />);
    expect(screen.getAllByLabelText("2.1").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("2.2").length).toBeGreaterThan(0);
  });

  it("rend la coche de la case pressée, sans rien cocher lui-même", () => {
    const onToggle = vi.fn();
    renderRn(<BlockTrackingList read={series} tracking={null} onToggle={onToggle} />);

    press(screen.getAllByRole("checkbox")[1] as HTMLElement);
    expect(onToggle).toHaveBeenCalledWith({ row: 1, key: "a1" });
  });

  it("montre ce qui est coché, et le décompte qui va avec", () => {
    renderRn(
      <BlockTrackingList
        read={series}
        tracking={{ checked: [{ row: 0, key: "a1" }] }}
        onToggle={vi.fn()}
      />,
    );
    // Sur le « ✓ » que l'athlète VOIT : `accessibilityState` ne descend pas en `aria-checked` sous
    // react-native-web (même choix que `TrackingList`).
    const [first, second] = screen.getAllByRole("checkbox");
    expect(first?.textContent).toContain("✓");
    expect(second?.textContent).not.toContain("✓");
    expect(screen.getByText("block.tally.sets")).toBeTruthy();
  });

  it("reste silencieux tant que rien n'est coché : jamais « 0 sur 4 »", () => {
    renderRn(<BlockTrackingList read={series} tracking={null} onToggle={vi.fn()} />);
    expect(screen.queryByText(/block\.tally\.sets/)).toBeNull();
  });
});

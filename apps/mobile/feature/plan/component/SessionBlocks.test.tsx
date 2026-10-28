import { screen } from "@testing-library/react";
import { router } from "expo-router";
import { describe, expect, it, vi } from "vitest";
import { SessionBlocks } from "@/feature/plan/component/SessionBlocks";
import { blockSession } from "@/test/block-session";
import { press, renderRn } from "@/test/render";
import { storedItems } from "@/test/setup";

// La consigne et les documents ont leur test (`ExerciseCard`) : hors sujet pour la liste.
vi.mock("@/feature/plan/component/ExerciseExtras", () => ({ ExerciseExtras: () => null }));

describe("SessionBlocks", () => {
  it("compte les blocs et donne une puce à chacun, par son numéro ou son libellé", () => {
    renderRn(<SessionBlocks session={blockSession()} scrollY={0} onScrollTo={vi.fn()} />);

    expect(screen.getByText("plan.blocks.count")).toBeTruthy();
    expect(screen.getAllByText("Finisher").length).toBeGreaterThan(1);
  });

  it("fait défiler jusqu'au bloc dont on touche la puce", () => {
    const onScrollTo = vi.fn();
    renderRn(<SessionBlocks session={blockSession()} scrollY={0} onScrollTo={onScrollTo} />);

    const [chip] = screen.getAllByText("Finisher");
    press(chip as HTMLElement);

    expect(onScrollTo).toHaveBeenCalledWith(0);
  });

  it("ouvre l'écran du bloc depuis sa carte", () => {
    renderRn(<SessionBlocks session={blockSession()} scrollY={0} onScrollTo={vi.fn()} />);

    const [card] = screen.getAllByLabelText("plan.blocks.open");
    press(card as HTMLElement);

    expect(router.push).toHaveBeenCalledWith("/session/s-1/block/blk-1");
  });

  it("montre le décompte coché en local, avant tout envoi", async () => {
    storedItems.set(
      "cimavia-block-tracking:s-1",
      JSON.stringify({ "blk-1": { checked: [{ key: "a1", row: 0 }] } }),
    );
    renderRn(<SessionBlocks session={blockSession()} scrollY={0} onScrollTo={vi.fn()} />);

    expect(await screen.findByText("block.tally.sets")).toBeTruthy();
  });
});

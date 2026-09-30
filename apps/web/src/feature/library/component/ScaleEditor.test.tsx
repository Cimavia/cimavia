import {
  FRENCH_CLIMBING_SCALE,
  type OrderedScale,
  SCALE_MAX_STEPS,
  V_BOULDERING_SCALE,
} from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { ScaleEditor } from "./ScaleEditor";

const STEP = "library.builder.scale.stepLabel";
const ADD = "library.builder.scale.addStep";
const REMOVE = "library.builder.scale.removeStep";

/** Le parent GARDE l'échelle, comme `CustomMetricForm` : chaque geste se relit à l'écran. */
function Harness({
  initial,
  onScale,
}: Readonly<{ initial: OrderedScale; onScale: (scale: OrderedScale) => void }>) {
  const [scale, setScale] = useState(initial);
  return (
    <ScaleEditor
      scale={scale}
      onChange={(next) => {
        setScale(next);
        onScale(next);
      }}
    />
  );
}

function setup(initial: OrderedScale = ["facile", "moyen", "dur"]) {
  const onScale = vi.fn();
  const view = renderWithProviders(<Harness initial={initial} onScale={onScale} />);
  const handle = (rank: number) =>
    view.getByRole("button", { name: `library.builder.scale.moveStep ${rank}` });
  // `queryAllByText` rend les nœuds dans l'ordre du document : l'ordre que le coach lit.
  const order = () =>
    view.queryAllByText(/^(facile|moyen|dur|extrême)$/).map((node) => node.textContent);
  return {
    ...view,
    onScale,
    handle,
    order,
    input: () => view.getByRole("textbox", { name: STEP }),
  };
}

describe("ScaleEditor — ordre des paliers", () => {
  describeReorder(["facile", "moyen", "dur"], () => {
    const { user, handle, order, onScale } = setup();
    const press = async (rank: number, key: string) => {
      handle(rank).focus();
      await user.keyboard(key);
    };
    return {
      order,
      moveUp: (rank) => press(rank, "{ArrowUp}"),
      moveDown: (rank) => press(rank, "{ArrowDown}"),
      drag: (from, to) => dragOnto(handle(from), handle(to)),
      writes: () => onScale.mock.calls.length,
    };
  });

  it("estompe le palier saisi et éclaire le palier survolé pendant le glisser", () => {
    const { handle } = setup();
    const row = (rank: number) => handle(rank).parentElement as HTMLElement;

    fireEvent.dragStart(handle(1));
    fireEvent.dragOver(handle(2));

    expect(row(1)).toHaveClass("opacity-40");
    expect(row(2)).toHaveClass("bg-cmv-accent-soft");
    expect(row(3)).toHaveClass("bg-cmv-surface");
  });
});

describe("ScaleEditor — ajout", () => {
  it("ajoute le palier tapé en fin d'échelle, vide le champ et y rend le focus", async () => {
    const { user, getByRole, input, order } = setup();

    await user.type(input(), "extrême");
    await user.click(getByRole("button", { name: ADD }));

    expect(order()).toEqual(["facile", "moyen", "dur", "extrême"]);
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  it("ajoute aussi avec Entrée, sans les espaces autour", async () => {
    const { user, input, order } = setup();

    await user.type(input(), "  extrême  {Enter}");

    expect(order()).toEqual(["facile", "moyen", "dur", "extrême"]);
  });

  // Un doublon casserait `scaleStepIndex`, qui rend la PREMIÈRE position trouvée.
  it("refuse un palier déjà présent, et vide le champ", async () => {
    const { user, input, onScale } = setup();

    await user.type(input(), "moyen{Enter}");

    expect(onScale).not.toHaveBeenCalled();
    expect(input()).toHaveValue("");
  });

  it("n'ajoute rien sur Entrée dans un champ blanc", async () => {
    const { user, input, onScale } = setup();

    await user.type(input(), "   {Enter}");

    expect(onScale).not.toHaveBeenCalled();
  });

  it("ferme le bouton tant que le champ est blanc", async () => {
    const { user, getByRole, input } = setup();

    expect(getByRole("button", { name: ADD })).toBeDisabled();
    await user.type(input(), "  ");
    expect(getByRole("button", { name: ADD })).toBeDisabled();
    await user.type(input(), "x");
    expect(getByRole("button", { name: ADD })).toBeEnabled();
  });

  it("ferme le champ et le bouton quand l'échelle est pleine", () => {
    const full = Array.from({ length: SCALE_MAX_STEPS }, (_, index) => `p${index}`);
    const { getByRole, input } = setup(full);

    expect(input()).toBeDisabled();
    expect(getByRole("button", { name: ADD })).toBeDisabled();
  });
});

describe("ScaleEditor — retrait et cotations livrées", () => {
  it("retire le palier désigné, et lui seul", async () => {
    const { user, getAllByRole, order } = setup();

    await user.click(getAllByRole("button", { name: REMOVE })[1] as HTMLElement);

    expect(order()).toEqual(["facile", "dur"]);
  });

  // Les cotations livrées sont DUPLICABLES : une copie que le coach pourra ensuite retoucher.
  it.each([
    ["library.builder.scale.duplicateFrench", FRENCH_CLIMBING_SCALE],
    ["library.builder.scale.duplicateV", V_BOULDERING_SCALE],
  ])("remplace l'échelle par une copie de « %s »", async (name, shipped) => {
    const { user, getByRole, onScale } = setup([]);

    await user.click(getByRole("button", { name }));

    const copy = onScale.mock.lastCall?.[0] as OrderedScale;
    expect(copy).toEqual([...shipped]);
    expect(copy).not.toBe(shipped);
  });
});

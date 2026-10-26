import {
  type SessionBlock,
  STRUCTURE_PRESETS,
  StructureOrder,
  StructurePresetKey,
  StructureRepeat,
  type StructureSettings,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockSettingsPanel } from "./BlockSettingsPanel";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const EMOM = STRUCTURE_PRESETS[StructurePresetKey.EMOM];

const exercise = (key: string) => ({
  key,
  exerciseId: `ex-${key}`,
  note: null,
  grid: { metrics: [], rows: [] },
});

function blockOf(settings: StructureSettings, over: Partial<SessionBlock> = {}): SessionBlock {
  return {
    id: "b-1",
    name: "Séries",
    label: null,
    instructions: null,
    settings,
    copiedSettings: SERIES,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    exercises: [exercise("a")],
    ...over,
  };
}

function mount(block: SessionBlock, letter: string | null = "A") {
  const onApply = vi.fn<(block: SessionBlock) => void>();
  const onClose = vi.fn();
  const view = renderWithProviders(
    <BlockSettingsPanel block={block} letter={letter} onApply={onApply} onClose={onClose} />,
  );
  const applied = () => onApply.mock.lastCall?.[0] as SessionBlock;
  return { ...view, onApply, onClose, applied };
}

const REVERT = "library.session.blocks.revertTo";
const APPLY = "library.session.blocks.apply";

describe("BlockSettingsPanel", () => {
  it("pose libellé et consigne d'un geste, vides rendus à null, puis se ferme", async () => {
    const view = mount(blockOf(SERIES, { label: "Échauffement", instructions: "Calme" }));

    expect(view.getByText("library.session.blocks.settingsOf")).toBeInTheDocument();
    await view.user.clear(view.getByRole("textbox", { name: "library.session.blocks.label" }));
    await view.user.type(
      view.getByRole("textbox", { name: "library.session.blocks.label" }),
      "  Force  ",
    );
    await view.user.clear(
      view.getByRole("textbox", { name: "library.session.blocks.instructions" }),
    );
    await view.user.click(view.getByRole("button", { name: APPLY }));

    expect(view.applied()).toMatchObject({ label: "Force", instructions: null, settings: SERIES });
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it("se titre par le libellé d'un bloc qui n'a pas de lettre", () => {
    const view = mount(blockOf(SERIES, { label: "Retour au calme" }), null);

    expect(view.getByText("library.session.blocks.settingsOfLabel")).toBeInTheDocument();
  });

  it("ne change rien quand on annule", async () => {
    const view = mount(blockOf(SERIES));

    await view.user.type(view.getByRole("textbox", { name: "library.session.blocks.label" }), "X");
    await view.user.click(view.getByRole("button", { name: "common.cancel" }));

    expect(view.onApply).not.toHaveBeenCalled();
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it("ne propose de revenir à la structure que pour un bloc ajusté", () => {
    const view = mount(blockOf(SERIES));

    expect(view.getByRole("button", { name: REVERT })).toBeDisabled();
    expect(view.getByText("Séries")).toBeInTheDocument();
  });

  // Ajusté = une autre forme de réponses que la structure copiée (`isCustomized`).
  it("revient aux réglages copiés de la structure", async () => {
    const view = mount(blockOf(EMOM));

    expect(view.getByText("library.session.blocks.customizedFrom")).toBeInTheDocument();
    await view.user.click(view.getByRole("button", { name: REVERT }));
    await view.user.click(view.getByRole("button", { name: APPLY }));

    expect(view.applied().settings).toEqual(SERIES);
  });

  // Les réglages copiés manquent de bips pour trois exercices : y revenir serait refusé.
  it("ferme le retour aux réglages copiés que l'enregistrement refuserait", () => {
    const tooFew = { ...EMOM, repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 }, order: "ONE" };
    const view = mount(
      blockOf(EMOM, {
        copiedSettings: tooFew as StructureSettings,
        exercises: [exercise("a"), exercise("b"), exercise("c")],
      }),
    );

    expect(view.getByRole("button", { name: REVERT })).toBeDisabled();
  });

  it("choisit l'ordre des exercices sous un rythme imposé, et dit quand les bips manquent", async () => {
    const shortEmom = { ...EMOM, repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 } } as const;
    const view = mount(
      blockOf(shortEmom, {
        copiedSettings: shortEmom,
        exercises: [exercise("a"), exercise("b"), exercise("c")],
      }),
    );

    expect(view.queryByRole("alert")).toBeNull();
    await view.user.click(view.getByRole("button", { name: "library.session.blocks.orderOne" }));

    expect(view.getByRole("alert")).toHaveTextContent("block.settings.tooFewBeeps");
    await view.user.click(view.getByRole("button", { name: APPLY }));
    expect(view.applied().settings.order).toBe(StructureOrder.ONE);
  });

  it("ne demande pas d'ordre quand l'athlète enchaîne à son rythme", () => {
    const view = mount(blockOf(SERIES, { exercises: [exercise("a"), exercise("b")] }));

    expect(view.queryByRole("button", { name: "library.session.blocks.orderOne" })).toBeNull();
  });
});

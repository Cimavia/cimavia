import {
  formatTrainingDuration,
  NEW_STRUCTURE_SETTINGS,
  STRUCTURE_PRESETS,
  type StructureSettings,
} from "@cmv/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { StructurePreview } from "./StructurePreview";
import { StructureSettingsForm } from "./StructureSettingsForm";

const ATHLETE = "library.structure.form.athlete";
const BEEP = "library.structure.form.beep";
const CYCLE = "library.structure.form.cycle";
const MAX = "library.structure.form.max";
const ONCE = "library.structure.form.once";
const REST_EXERCISES = "library.structure.form.restBetweenExercises";
const REST_ROUNDS = "library.structure.form.restBetweenRounds";
const LIMIT = "library.structure.form.limit";

/** Le formulaire et son panneau, sur un état réel : chaque geste se voit des deux côtés. */
function setup(initial: StructureSettings = NEW_STRUCTURE_SETTINGS) {
  const seen = vi.fn();
  function Harness() {
    const [settings, setSettings] = useState(initial);
    return (
      <>
        <StructureSettingsForm
          settings={settings}
          onChange={(next) => {
            seen(next);
            setSettings(next);
          }}
        />
        <StructurePreview settings={settings} />
      </>
    );
  }
  return { ...renderWithProviders(<Harness />), seen };
}

const choice = (view: ReturnType<typeof setup>, name: string) =>
  view.getByRole("radio", { name: new RegExp(name) });
const toggle = (view: ReturnType<typeof setup>, name: string) =>
  view.getByRole("checkbox", { name: new RegExp(name) });

describe("StructureSettingsForm — les questions", () => {
  it("s'ouvre sur les réponses des réglages, et leurs valeurs", () => {
    const view = setup();

    expect(choice(view, ATHLETE)).toBeChecked();
    expect(view.getByRole("radio", { name: /library\.structure\.form\.rounds/ })).toBeChecked();
    expect(view.getByRole("textbox", { name: "library.structure.form.roundsLabel" })).toHaveValue(
      "4",
    );
    expect(toggle(view, REST_ROUNDS)).toBeChecked();
    expect(view.getByRole("textbox", { name: REST_ROUNDS })).toHaveValue(
      formatTrainingDuration(120),
    );
  });

  it("un bip grise ce qui demande l'athlète à son rythme, et dit pourquoi", async () => {
    const view = setup();

    await view.user.click(choice(view, BEEP));

    expect(view.getByRole("textbox", { name: "library.structure.form.every" })).toHaveValue(
      formatTrainingDuration(60),
    );
    expect(choice(view, MAX)).toBeDisabled();
    expect(choice(view, ONCE)).toBeDisabled();
    expect(view.getAllByText("block.disabled.roundsWithBeep")).toHaveLength(2);
    // Le bip sert de repos : celui entre tours, posé, s'est vidé.
    expect(toggle(view, REST_ROUNDS)).toBeDisabled();
    expect(toggle(view, REST_ROUNDS)).not.toBeChecked();
    expect(view.seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ restBetweenRoundsSeconds: null }),
    );
  });

  it("effort et repos imposés se règlent chacun", async () => {
    const view = setup();

    await view.user.click(choice(view, CYCLE));
    const work = view.getByRole("textbox", { name: "library.structure.form.work" });
    await view.user.clear(work);
    await view.user.type(work, "40{Enter}");

    expect(view.seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ advance: { kind: "CYCLE", workSeconds: 40, restSeconds: 10 } }),
    );
    expect(view.getByRole("textbox", { name: "library.structure.form.rest" })).toBeInTheDocument();
  });

  it("change le nombre de tours", async () => {
    const view = setup();
    const rounds = view.getByRole("textbox", { name: "library.structure.form.roundsLabel" });

    await view.user.clear(rounds);
    await view.user.type(rounds, "6{Enter}");

    expect(view.seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ repeat: { kind: "ROUNDS", rounds: 6 } }),
    );
  });

  it("autant que possible donne sa durée, qui rend la limite inutile", async () => {
    const view = setup();

    await view.user.click(choice(view, MAX));

    expect(view.getByRole("textbox", { name: "library.structure.form.capIn" })).toHaveValue(
      formatTrainingDuration(720),
    );
    expect(toggle(view, LIMIT)).toBeDisabled();
    expect(view.getByText("block.disabled.capAlready")).toBeInTheDocument();
    expect(toggle(view, REST_ROUNDS)).toBeDisabled();
  });

  it("une seule fois n'a aucune valeur à régler", async () => {
    const view = setup();

    await view.user.click(choice(view, ONCE));

    expect(
      view.queryByRole("textbox", { name: "library.structure.form.roundsLabel" }),
    ).not.toBeInTheDocument();
    expect(view.getByText("block.disabled.singlePass")).toBeInTheDocument();
  });

  it("coche un repos à sa valeur par défaut, et le décoche", async () => {
    const view = setup();

    await view.user.click(toggle(view, REST_EXERCISES));
    expect(view.getByRole("textbox", { name: REST_EXERCISES })).toHaveValue(
      formatTrainingDuration(30),
    );
    await view.user.click(toggle(view, REST_EXERCISES));

    expect(view.queryByRole("textbox", { name: REST_EXERCISES })).not.toBeInTheDocument();
    expect(view.seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ restBetweenExercisesSeconds: null }),
    );
  });

  it("refuse une durée hors bornes, sans la propager", async () => {
    const view = setup();
    const rest = view.getByRole("textbox", { name: REST_ROUNDS });

    await view.user.clear(rest);
    // Un nombre nu compte des secondes : 20 000 s dépassent les 3 h permises.
    await view.user.type(rest, "20000{Enter}");

    expect(view.getByText("common.durationOutOfBounds")).toBeInTheDocument();
    expect(view.seen).not.toHaveBeenCalled();
  });
});

describe("StructurePreview", () => {
  it("dit la structure à son rythme, sans durée inventée", () => {
    const view = setup();

    expect(view.getByText("library.structure.preview.phrase")).toBeInTheDocument();
    expect(view.getByText("—")).toBeInTheDocument();
    expect(view.getByText("library.structure.preview.ownPace")).toBeInTheDocument();
    expect(view.getByText("library.structure.preview.rest")).toBeInTheDocument();
  });

  it("déduit la durée d'un bip, et la porte sur l'axe", () => {
    const view = setup(STRUCTURE_PRESETS.EMOM);

    expect(view.getAllByText(formatTrainingDuration(600) as string)).toHaveLength(2);
    expect(view.getByText("library.structure.preview.durationWhy")).toBeInTheDocument();
    expect(view.getByText("library.structure.preview.beep")).toBeInTheDocument();
  });

  it("légende l'effort et le repos d'un cycle", () => {
    const view = setup(STRUCTURE_PRESETS.TABATA);

    expect(view.getByText("library.structure.preview.work")).toBeInTheDocument();
    expect(view.getByText("library.structure.preview.rest")).toBeInTheDocument();
  });

  it("des tours pendant la durée d'un autant que possible", () => {
    const view = setup(STRUCTURE_PRESETS.AMRAP);

    expect(view.getByText("library.structure.preview.roundsDuring")).toBeInTheDocument();
    expect(view.queryByText("library.structure.preview.rest")).not.toBeInTheDocument();
  });
});

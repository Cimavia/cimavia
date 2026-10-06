import {
  type BlockMetric,
  FRENCH_CLIMBING_SCALE,
  formatDecimal,
  METRIC_TEXT_VALUE_MAX_LENGTH,
  MetricKey,
  MetricSource,
  MetricUnit,
  type MetricValue,
} from "@cmv/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { GridCell } from "./GridCell";

const column = (key: MetricKey, unit: MetricUnit): BlockMetric => ({
  id: "col",
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
  collapsed: false,
});

const load = column(MetricKey.LOAD, MetricUnit.KILOGRAMS);
const rest = column(MetricKey.REST_BETWEEN_SETS, MetricUnit.NONE);
const label = column(MetricKey.LABEL, MetricUnit.NONE);
const grade = column(MetricKey.GRADE, MetricUnit.NONE);

/**
 * Un parent qui GARDE la valeur, comme la grille : sans lui, le champ ne se réécrirait jamais et
 * le bug de #298 — la virgule effacée par le rendu suivant — resterait invisible.
 */
function Controlled({
  metric,
  initial,
  onChange,
  onCommitLine,
}: Readonly<{
  metric: BlockMetric;
  initial: MetricValue;
  onChange: (value: MetricValue) => void;
  onCommitLine: (value: MetricValue) => void;
}>) {
  const [value, setValue] = useState(initial);
  return (
    <GridCell
      metric={metric}
      customMetrics={[]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onCommitLine={onCommitLine}
    />
  );
}

function setup(metric: BlockMetric, initial: MetricValue = null) {
  const onChange = vi.fn();
  const onCommitLine = vi.fn();
  const view = renderWithProviders(
    <Controlled
      metric={metric}
      initial={initial}
      onChange={onChange}
      onCommitLine={onCommitLine}
    />,
  );
  return { ...view, onChange, onCommitLine };
}

/** Les cellules à saisie libre : un champ texte. */
function setupInput(metric: BlockMetric, initial: MetricValue = null) {
  const view = setup(metric, initial);
  return { ...view, input: view.getByRole("textbox") };
}

describe("GridCell — nombre", () => {
  /** Le cas de #298 : « 12,5 » devenait 125, la virgule effacée avant le « 5 ». */
  it.each(["12,5", "12.5"])("enregistre « %s » comme 12,5 à la sortie du champ", async (typed) => {
    const { user, input, onChange } = setupInput(load);

    await user.type(input, typed);
    await user.tab();

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(12.5);
  });

  it("garde le séparateur à l'écran pendant la frappe", async () => {
    const { user, input } = setupInput(load);

    await user.type(input, "12,");

    expect(input).toHaveValue("12,");
  });

  it("remet la valeur en forme, dans la langue du lecteur, à la sortie du champ", async () => {
    const { user, input } = setupInput(load);

    await user.type(input, "12.5");
    await user.tab();

    // Comparé au formateur et non à « 12,5 » : la langue des tests est `cimode`, qu'`Intl`
    // résout selon la machine.
    expect(input).toHaveValue(formatDecimal(12.5, "cimode"));
  });

  it("vaut null, jamais zéro, quand on vide le champ", async () => {
    const { user, input, onChange } = setupInput(load, 10);

    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("refuse une saisie qui n'est pas un nombre, sans toucher à la valeur", async () => {
    const { user, input, onChange } = setupInput(load, 10);

    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("abc");
    expect(input).toHaveAccessibleDescription("library.builder.grid.numberInvalid");
  });

  /**
   * #566 : `border-transparent`, posé à côté du liseré rouge, l'emportait dans le CSS construit —
   * la cellule refusée ne se distinguait de rien.
   */
  it("remplace la bordure transparente par le liseré d'erreur sur une saisie refusée", async () => {
    const { user, input } = setupInput(load, 10);

    await user.clear(input);
    await user.type(input, "12kgg");
    await user.tab();

    expect(input).toHaveClass("border-cmv-error");
    expect(input).not.toHaveClass("border-transparent");
  });

  it("retire le message dès que la saisie est vidée", async () => {
    const { user, input, onChange, queryByText } = setupInput(load, 10);
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveClass("border-transparent");
    expect(queryByText("library.builder.grid.numberInvalid")).toBeNull();
  });

  it("n'écrit rien quand on retape la valeur déjà enregistrée", async () => {
    const { user, input, onChange } = setupInput(load, 10);

    await user.clear(input);
    await user.type(input, "10");
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("transmet la valeur validée avec Entrée", async () => {
    const { user, input, onCommitLine } = setupInput(load);

    await user.type(input, "12,5{Enter}");

    expect(onCommitLine).toHaveBeenCalledWith(12.5);
  });

  /** Une ligne créée sur une saisie refusée ferait disparaître l'erreur sous la ligne suivante. */
  it("ne valide pas la ligne sur une saisie refusée", async () => {
    const { user, input, onCommitLine } = setupInput(load);

    await user.type(input, "abc{Enter}");

    expect(onCommitLine).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});

describe("GridCell — durée", () => {
  it("transmet les secondes validées avec Entrée", async () => {
    const { user, input, onChange, onCommitLine } = setupInput(rest);

    await user.type(input, "2:30{Enter}");

    expect(onChange).toHaveBeenCalledWith(150);
    expect(onCommitLine).toHaveBeenCalledWith(150);
  });

  it("dit qu'une durée n'est pas comprise, sous la cellule", async () => {
    const { user, input } = setupInput(rest, 31);

    await user.clear(input);
    await user.type(input, "31 sfffff");
    await user.tab();

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("library.builder.grid.durationInvalid");
  });

  it("transmet la valeur en place quand Entrée arrive sans rien avoir tapé", async () => {
    const { user, input, onChange, onCommitLine } = setupInput(rest, 90);

    await user.click(input);
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommitLine).toHaveBeenCalledWith(90);
  });
});

describe("GridCell — texte", () => {
  it("transmet le texte tapé avec Entrée", async () => {
    const { user, input, onCommitLine } = setupInput(label);

    await user.type(input, "Voie 1{Enter}");

    expect(onCommitLine).toHaveBeenCalledWith("Voie 1");
  });

  it("borne le texte à ce que l'API accepte (#319)", () => {
    const { input } = setupInput(label);

    expect(input).toHaveAttribute("maxLength", String(METRIC_TEXT_VALUE_MAX_LENGTH));
  });
});

describe("GridCell — texte vidé", () => {
  // Règle dure n°5 : un champ vidé vaut null, jamais une chaîne vide enregistrée comme valeur.
  it("vaut null quand on vide le champ", async () => {
    const { user, input, onChange } = setupInput(label, "Voie 1");

    await user.clear(input);

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("GridCell — échelle", () => {
  it("propose l'option vide puis les paliers de l'échelle, dans l'ordre", () => {
    const { getByRole } = setup(grade);

    const options = Array.from((getByRole("combobox") as HTMLSelectElement).options);

    expect(options[0]).toHaveTextContent("library.builder.grid.emptyValue");
    expect(options[0]).toHaveValue("");
    expect(options.slice(1).map((option) => option.value)).toEqual([...FRENCH_CLIMBING_SCALE]);
  });

  it("montre le palier posé", () => {
    const { getByRole } = setup(grade, "6b");

    expect(getByRole("combobox")).toHaveValue("6b");
  });

  it("écrit le palier choisi", async () => {
    const { user, getByRole, onChange } = setup(grade);

    await user.selectOptions(getByRole("combobox"), "7a");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("7a");
  });

  // L'option vide n'est pas un défaut : c'est le moyen de RETIRER une valeur posée.
  it("retire le palier posé par l'option vide, en null", async () => {
    const { user, getByRole, onChange } = setup(grade, "6b");

    await user.selectOptions(getByRole("combobox"), "");

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(getByRole("combobox")).toHaveValue("");
  });
});

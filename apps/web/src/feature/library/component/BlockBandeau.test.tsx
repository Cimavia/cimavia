import { type BlockStructure, BlockType, DEFAULT_BLOCK_STRUCTURE } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockBandeau } from "./BlockBandeau";

const field = (name: string) => `library.builder.bandeau.${name}`;

/** Le parent GARDE la structure, comme la carte de bloc : ce qui est écrit se relit à l'écran. */
function Harness({
  initial,
  onStructure,
}: Readonly<{ initial: BlockStructure; onStructure: (structure: BlockStructure) => void }>) {
  const [structure, setStructure] = useState(initial);
  return (
    <BlockBandeau
      structure={structure}
      onChange={(next) => {
        setStructure(next);
        onStructure(next);
      }}
    />
  );
}

function setup(initial: BlockStructure) {
  const onStructure = vi.fn();
  const view = renderWithProviders(<Harness initial={initial} onStructure={onStructure} />);
  const count = (name: string) => view.getByRole("spinbutton", { name: field(name) });
  const duration = (name: string) => view.getByRole("textbox", { name: field(name) });
  /** Une durée se lit à la sortie du champ : la frappe seule n'écrit rien. */
  const typeDuration = async (name: string, text: string) => {
    await view.user.clear(duration(name));
    if (text !== "") await view.user.type(duration(name), text);
    await view.user.tab();
  };
  const last = () => onStructure.mock.lastCall?.[0] as BlockStructure;
  return { ...view, onStructure, count, duration, typeDuration, last };
}

describe("BlockBandeau — Libre", () => {
  // Rien ne vaut pour toutes les lignes : le bandeau n'a rien à montrer.
  it("ne montre aucun champ", () => {
    const { queryByRole } = setup(DEFAULT_BLOCK_STRUCTURE[BlockType.FREE]);

    expect(queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("BlockBandeau — Séries", () => {
  const series = DEFAULT_BLOCK_STRUCTURE[BlockType.SERIES];

  it("écrit le nombre de séries", () => {
    const { count, last } = setup(series);

    expect(count("setCount")).toHaveValue(4);
    fireEvent.change(count("setCount"), { target: { value: "5" } });

    expect(last()).toEqual({ ...series, setCount: 5 });
  });

  // Un champ vidé ne vaut pas zéro : il garde sa dernière valeur.
  it.each([
    ["", "un champ vidé"],
    ["0", "une valeur sous le plancher"],
  ])("ignore « %s » — %s", (typed) => {
    const { count, onStructure } = setup(series);

    fireEvent.change(count("setCount"), { target: { value: typed } });

    expect(onStructure).not.toHaveBeenCalled();
    expect(count("setCount")).toHaveValue(4);
  });

  it("écrit le repos entre séries, en secondes", async () => {
    const { typeDuration, last } = setup(series);

    await typeDuration("restBetweenSetsSeconds", "2:30");

    expect(last()).toEqual({ ...series, restBetweenSetsSeconds: 150 });
  });

  // Le repos est facultatif : le vider le retire, en null (règle dure n°5).
  it("retire le repos quand on le vide", async () => {
    const { typeDuration, last } = setup({ ...series, restBetweenSetsSeconds: 90 });

    await typeDuration("restBetweenSetsSeconds", "");

    expect(last()).toEqual({ ...series, restBetweenSetsSeconds: null });
  });
});

/**
 * #526 : un placeholder qui montre une valeur se lisait comme une valeur saisie — le coach croyait
 * avoir posé un repos de 2'30 qu'il n'avait jamais écrit. Chaque exemple passe par le catalogue,
 * qui le préfixe de « Ex. ».
 */
describe("BlockBandeau — les exemples (#526)", () => {
  it("laisse vide un repos non renseigné, et n'en montre que l'exemple", () => {
    const { duration } = setup({
      ...DEFAULT_BLOCK_STRUCTURE[BlockType.SERIES],
      restBetweenSetsSeconds: null,
    });

    expect(duration("restBetweenSetsSeconds")).toHaveValue("");
    expect(duration("restBetweenSetsSeconds")).toHaveAttribute(
      "placeholder",
      field("restBetweenSetsPlaceholder"),
    );
  });

  it.each([
    [BlockType.EMOM, "intervalSeconds", "intervalPlaceholder"],
    [BlockType.EMOM, "totalDurationSeconds", "emomDurationPlaceholder"],
    [BlockType.AMRAP, "totalDurationSeconds", "amrapDurationPlaceholder"],
    [BlockType.CIRCUIT, "restBetweenRoundsSeconds", "restBetweenRoundsPlaceholder"],
  ] as const)("%s : « %s » tire son exemple du catalogue", (type, name, placeholder) => {
    const { duration } = setup(DEFAULT_BLOCK_STRUCTURE[type]);

    expect(duration(name)).toHaveAttribute("placeholder", field(placeholder));
  });
});

describe("BlockBandeau — EMOM", () => {
  const emom = DEFAULT_BLOCK_STRUCTURE[BlockType.EMOM];

  it.each([
    ["intervalSeconds", "1:30", 90],
    ["totalDurationSeconds", "12:00", 720],
  ])("écrit %s", async (name, typed, seconds) => {
    const { typeDuration, last } = setup(emom);

    await typeDuration(name, typed);

    expect(last()).toEqual({ ...emom, [name]: seconds });
  });

  // Un EMOM sans intervalle ni durée n'est pas un EMOM : les vider ne retire rien.
  it.each(["intervalSeconds", "totalDurationSeconds"])("refuse de vider %s", async (name) => {
    const { typeDuration, onStructure } = setup(emom);

    await typeDuration(name, "");

    expect(onStructure).not.toHaveBeenCalled();
  });

  // Dérivé des deux durées, jamais stocké : il ne peut pas les contredire.
  it("affiche le nombre de tops dérivé", () => {
    const { getByText } = setup(emom);

    expect(getByText(field("topCount"))).toBeInTheDocument();
  });
});

describe("BlockBandeau — AMRAP", () => {
  // Un objectif posé : le cas sans objectif relève de #331 (repli `?? 1`), laissé à ce bug.
  const amrap = { ...DEFAULT_BLOCK_STRUCTURE[BlockType.AMRAP], targetRounds: 5 };

  it("écrit la durée totale", async () => {
    const { typeDuration, last } = setup(amrap);

    await typeDuration("totalDurationSeconds", "10:00");

    expect(last()).toEqual({ ...amrap, totalDurationSeconds: 600 });
  });

  it("refuse de vider la durée totale", async () => {
    const { typeDuration, onStructure } = setup(amrap);

    await typeDuration("totalDurationSeconds", "");

    expect(onStructure).not.toHaveBeenCalled();
  });

  it("montre et écrit l'objectif de tours posé", () => {
    const { count, last } = setup(amrap);

    expect(count("targetRounds")).toHaveValue(5);
    fireEvent.change(count("targetRounds"), { target: { value: "6" } });

    expect(last()).toEqual({ ...amrap, targetRounds: 6 });
  });
});

describe("BlockBandeau — Circuit", () => {
  const circuit = DEFAULT_BLOCK_STRUCTURE[BlockType.CIRCUIT];

  it("écrit le nombre de tours", () => {
    const { count, last } = setup(circuit);

    fireEvent.change(count("roundCount"), { target: { value: "3" } });

    expect(last()).toEqual({ ...circuit, roundCount: 3 });
  });

  it("écrit puis retire le repos entre tours", async () => {
    const { typeDuration, last } = setup(circuit);

    await typeDuration("restBetweenRoundsSeconds", "3:00");
    expect(last()).toEqual({ ...circuit, restBetweenRoundsSeconds: 180 });

    await typeDuration("restBetweenRoundsSeconds", "");
    expect(last()).toEqual({ ...circuit, restBetweenRoundsSeconds: null });
  });
});

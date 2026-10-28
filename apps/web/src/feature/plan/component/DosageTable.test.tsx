import {
  type BlockGrid,
  CompositionOrigin,
  dosageColumns,
  MetricKey,
  MetricSource,
  MetricUnit,
  type PlanWeekDto,
  PlanWeekType,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  ScheduledSessionStatus,
  SettingValue,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { DosageTable } from "./DosageTable";

const SETTINGS = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const WEEKS = [
  { id: "pw-1", weekNumber: 1, type: PlanWeekType.TRAINING },
  { id: "pw-2", weekNumber: 2, type: PlanWeekType.DELOAD },
  { id: "pw-3", weekNumber: 3, type: PlanWeekType.TRAINING },
] as PlanWeekDto[];

const gridOf = (...reps: number[]): BlockGrid => ({
  metrics: [
    {
      id: "reps",
      label: null,
      source: MetricSource.CATALOG,
      key: MetricKey.REPETITIONS,
      unit: MetricUnit.REPS,
    },
  ],
  rows: reps.map((value, index) => ({ id: `r${index}`, values: { reps: value } })),
});

type Planned = ScheduledSessionBlockDto["exercises"][number];
const planned = (id: string, key: string, grid: BlockGrid, origin?: Planned["origin"]) => ({
  id,
  key,
  note: null,
  grid,
  origin: origin ?? { kind: CompositionOrigin.RECEIVED },
});

/** Séries : Tractions (`a`) et Gainage (`b`), reçus à 8 répétitions. */
const blockOf = (exercises: Planned[], over: Partial<ScheduledSessionBlockDto> = {}) =>
  ({
    id: "blk-1",
    name: "Séries",
    label: null,
    instructions: null,
    settings: SETTINGS,
    copiedSettings: SETTINGS,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    baseline: {
      settings: SETTINGS,
      exercises: [
        { key: "a", exerciseId: "ex-a", note: null, grid: gridOf(8) },
        { key: "b", exerciseId: "ex-b", note: null, grid: gridOf(8) },
      ],
    },
    tracking: null,
    exercises,
    ...over,
  }) as ScheduledSessionBlockDto;

/** Un retour au calme à libellé, sans exercice : seules ses valeurs se dosent. */
const cooldown = (id: string) =>
  blockOf([], {
    id,
    name: "Retour au calme",
    label: "RC",
    baseline: { settings: SETTINGS, exercises: [] },
  });

const row = (id: string, title: string) => ({
  id,
  sourceExerciseId: null,
  title,
  tags: [],
  customMetrics: [],
});

/** S1 telle que reçue ; S2 en décharge, Tractions à 10, Gainage retiré, Rameur ajouté. */
const W1: ScheduledSessionCopyDto = {
  id: "ss-1",
  planWeekId: "pw-1",
  scheduledDate: "2026-09-07",
  updatedAt: "2026-09-01T10:00:00.000Z",
  status: ScheduledSessionStatus.PLANNED,
  blocks: [
    blockOf([planned("w1-a", "a", gridOf(8, 8)), planned("w1-b", "b", gridOf(8))]),
    cooldown("blk-2"),
  ],
  exercises: [row("w1-a", "Tractions"), row("w1-b", "Gainage")],
} as unknown as ScheduledSessionCopyDto;
const W2: ScheduledSessionCopyDto = {
  ...W1,
  id: "ss-2",
  planWeekId: "pw-2",
  scheduledDate: "2026-09-14",
  blocks: [
    blockOf([
      planned("w2-a", "a", gridOf(10)),
      planned("w2-n", "n", gridOf(12), { kind: CompositionOrigin.ADDED }),
    ]),
    cooldown("blk-2b"),
  ],
  exercises: [row("w2-a", "Tractions"), row("w2-n", "Rameur")],
} as unknown as ScheduledSessionCopyDto;

function render(
  copies: ScheduledSessionCopyDto[] = [W1, W2],
  over: Partial<Parameters<typeof DosageTable>[0]> = {},
) {
  const handlers = { onChange: vi.fn(), onRevertCopy: vi.fn(), onCompose: vi.fn() };
  const view = renderWithProviders(
    <DosageTable
      columns={dosageColumns(WEEKS, copies)}
      copies={copies}
      readOnly={false}
      {...handlers}
      {...over}
    />,
  );
  return { ...view, ...handlers };
}

/** La ligne d'une valeur, par l'en-tête qui la nomme. */
const rowOf = (view: ReturnType<typeof render>, name: string | RegExp, index = 0) =>
  view.getAllByRole("rowheader", { name })[index]?.closest("tr") as HTMLElement;

describe("DosageTable", () => {
  it("donne une colonne à chaque semaine, hachurée où la séance n'est pas posée", () => {
    const view = render();

    // « Valeur », puis S1 à S3 ; les en-têtes de bloc, eux, couvrent la ligne.
    const [head] = view.getAllByRole("rowgroup");
    expect(within(head as HTMLElement).getAllByRole("columnheader")).toHaveLength(4);
    expect(view.getByText("plan.dosage.notPlaced")).toBeTruthy();
    // La décharge le dit en tête de sa colonne.
    expect(view.getByText("plan.dosage.deloadDay")).toBeTruthy();
  });

  it("nomme par leur jour deux séances posées la même semaine", () => {
    const thursday = { ...W1, id: "ss-1b", scheduledDate: "2026-09-10" };
    const view = render([W1, thursday, W2]);

    expect(view.getAllByText("plan.dosage.weekOnDay")).toHaveLength(2);
  });

  it("numérote les blocs et nomme ceux qui ont un libellé", () => {
    const view = render();

    expect(view.getByText("RC")).toBeTruthy();
    expect(view.getByText("Retour au calme")).toBeTruthy();
    expect(view.getAllByText("Séries").length).toBeGreaterThan(0);
  });

  it("dit ce qu'une semaine n'a pas à régler, et ce que certaines seulement portent", () => {
    const view = render();

    // Gainage, retiré en S2 ; Rameur, ajouté en S2 seulement.
    expect(within(rowOf(view, /Gainage/)).getByText("plan.dosage.off.REMOVED")).toBeTruthy();
    const rower = rowOf(view, /Rameur/);
    expect(within(rower).getByText("plan.dosage.added")).toBeTruthy();
    expect(within(rower).getByText("plan.dosage.off.NOT_THIS_WEEK")).toBeTruthy();
  });

  it("code les exercices reçus par n'importe quelle semaine, pas seulement la première", () => {
    // S1 a reçu la séance-type avant que Gainage y entre : S2 l'a reçu, et le code reste.
    const older = {
      ...W1,
      blocks: [
        blockOf([planned("w1-a", "a", gridOf(8))], {
          baseline: {
            settings: SETTINGS,
            exercises: [{ key: "a", exerciseId: "ex-a", note: null, grid: gridOf(8) }],
          },
        }),
      ],
      exercises: [row("w1-a", "Tractions")],
    } as unknown as ScheduledSessionCopyDto;
    const received = {
      ...W2,
      blocks: [blockOf([planned("w2-a", "a", gridOf(8)), planned("w2-b", "b", gridOf(8))])],
      exercises: [row("w2-a", "Tractions"), row("w2-b", "Gainage")],
    } as unknown as ScheduledSessionCopyDto;
    const view = render([older, received]);

    expect(within(rowOf(view, /Tractions/)).getByText("1.1")).toBeTruthy();
    expect(within(rowOf(view, /Gainage/)).getByText("1.2")).toBeTruthy();
  });

  it("marque une semaine remplacée, et le code de l'exercice qu'elle remplace", () => {
    const replaced = {
      ...W2,
      blocks: [
        blockOf([
          planned("w2-a", "a", gridOf(10)),
          planned("w2-r", "r", gridOf(5), {
            kind: CompositionOrigin.REPLACEMENT,
            replacesKey: "b",
          } as Planned["origin"]),
        ]),
      ],
      exercises: [row("w2-a", "Tractions"), row("w2-r", "Planche")],
    } as unknown as ScheduledSessionCopyDto;
    const view = render([W1, replaced]);

    expect(within(rowOf(view, /Planche/)).getByText("plan.dosage.replaces")).toBeTruthy();
    expect(within(rowOf(view, /Gainage/)).getByText("plan.dosage.off.REPLACED")).toBeTruthy();
  });

  it("règle une série d'une semaine, et pose la même valeur partout", async () => {
    const view = render();
    const [w1Cell] = within(rowOf(view, /Tractions/)).getAllByRole("button");

    await view.user.click(w1Cell as HTMLElement);
    const dialog = view.getByRole("dialog", { name: "plan.dosage.editCell" });
    const [first, second] = within(dialog).getAllByRole("textbox");
    await view.user.clear(first as HTMLElement);
    await view.user.type(first as HTMLElement, "12");
    fireEvent.blur(first as HTMLElement);

    expect(view.onChange).toHaveBeenLastCalledWith(
      "ss-1",
      expect.objectContaining({ kind: "metric", blockIndex: 0, key: "a" }),
      expect.arrayContaining([12]),
    );
    expect(second).toBeTruthy();

    await view.user.click(
      within(dialog).getByRole("button", { name: "plan.dosage.sameEverywhere" }),
    );
    const [, , values] = view.onChange.mock.lastCall ?? [];
    expect(new Set(values)).toEqual(new Set([values[0]]));
  });

  it("rend à une cellule ajustée la valeur que sa semaine a reçue", async () => {
    const view = render();
    const [, w2Cell] = within(rowOf(view, /Tractions/)).getAllByRole("button");

    await view.user.click(w2Cell as HTMLElement);
    const dialog = view.getByRole("dialog");
    expect(within(dialog).getByText("plan.dosage.sessionTypeValue")).toBeTruthy();
    await view.user.click(
      within(dialog).getByRole("button", { name: "plan.composition.backToSessionType" }),
    );

    expect(view.onChange).toHaveBeenLastCalledWith(
      "ss-2",
      expect.objectContaining({ key: "a" }),
      expect.arrayContaining([8]),
    );
  });

  it("règle les tours d'un bloc, et se referme sur Échap", async () => {
    const view = render();
    const [rounds] = within(rowOf(view, "plan.dosage.setting.ROUNDS")).getAllByRole("button");

    await view.user.click(rounds as HTMLElement);
    const field = view.getByRole("textbox", { name: "plan.dosage.setting.ROUNDS" });
    await view.user.clear(field);
    await view.user.type(field, "5");
    fireEvent.blur(field);

    expect(view.onChange).toHaveBeenLastCalledWith(
      "ss-1",
      { kind: "setting", blockIndex: 0, field: SettingValue.ROUNDS },
      [5],
    );
    await view.user.keyboard("{Escape}");
    expect(view.queryByRole("dialog")).toBeNull();
  });

  it("se referme sur un clic ailleurs, pas sur un clic dans la fenêtre", async () => {
    const view = render();
    const [cell] = within(rowOf(view, /Tractions/)).getAllByRole("button");
    await view.user.click(cell as HTMLElement);
    const dialog = view.getByRole("dialog");
    const [field] = within(dialog).getAllByRole("textbox");
    // Bordé en permanence : hors de la grille, rien d'autre ne le montre.
    expect(field).toHaveClass("border-cmv-border");

    await view.user.click(field as HTMLElement);
    expect(view.getByRole("dialog")).toBeTruthy();

    await view.user.click(view.getByText("plan.dosage.value"));
    expect(view.queryByRole("dialog")).toBeNull();
  });

  it("passe d'une cellule à une autre sans refermer celle qui s'ouvre", async () => {
    const view = render();
    const [w1, w2] = within(rowOf(view, /Tractions/)).getAllByRole("button");
    await view.user.click(w1 as HTMLElement);
    await view.user.click(w2 as HTMLElement);

    expect(view.getAllByRole("dialog")).toHaveLength(1);
    expect(within(view.getByRole("dialog")).getByText("plan.dosage.sessionTypeValue")).toBeTruthy();
  });

  it("ouvre vers la gauche la fenêtre de la dernière semaine", async () => {
    const view = render([W1, W2], { columns: dosageColumns(WEEKS.slice(0, 2), [W1, W2]) });
    const [w1, w2] = within(rowOf(view, /Tractions/)).getAllByRole("button");

    await view.user.click(w1 as HTMLElement);
    expect(view.getByRole("dialog")).toHaveClass("left-0");
    await view.user.click(w2 as HTMLElement);
    expect(view.getByRole("dialog")).toHaveClass("right-0");
  });

  it("dit la phrase de la séance-type tant que chaque semaine la fait", () => {
    const view = render();

    const [header] = view.getAllByRole("columnheader", { name: /Séries/ });
    expect(header).toHaveAttribute("colSpan", "4");
  });

  it("donne sa phrase à chaque semaine dès que l'une en change les valeurs", () => {
    const more = { ...SETTINGS, repeat: { ...SETTINGS.repeat, rounds: 10 } };
    const moved = {
      ...W2,
      blocks: [{ ...(W2.blocks[0] as ScheduledSessionBlockDto), settings: more }, W2.blocks[1]],
    } as unknown as ScheduledSessionCopyDto;
    const view = render([W1, moved]);

    const [header] = view.getAllByRole("columnheader", { name: /Séries/ });
    expect(header).toHaveAttribute("colSpan", "1");
    // S1, S2, puis S3 où la séance n'est pas posée : une case chacune, hachurée pour S3.
    const cells = within(header?.closest("tr") as HTMLElement).getAllByRole("cell");
    expect(cells).toHaveLength(3);
    expect(cells[2]?.className).not.toBe(cells[0]?.className);
  });

  it("appelle séries les tours d'un exercice seul, dans la ligne comme dans sa saisie", async () => {
    const alone = {
      ...W1,
      blocks: [
        blockOf([planned("w1-a", "a", gridOf(8, 8))], {
          baseline: {
            settings: SETTINGS,
            exercises: [{ key: "a", exerciseId: "ex-a", note: null, grid: gridOf(8) }],
          },
        }),
      ],
      exercises: [row("w1-a", "Tractions")],
    } as unknown as ScheduledSessionCopyDto;
    const view = render([alone]);

    const [sets] = within(rowOf(view, "plan.dosage.setting.SETS")).getAllByRole("button");
    await view.user.click(sets as HTMLElement);

    expect(view.getByRole("textbox", { name: "plan.dosage.setting.SETS" })).toBeTruthy();
    expect(view.getByText("plan.dosage.setsNote")).toBeTruthy();
    expect(
      view.getByRole("rowheader", { name: "plan.dosage.setting.REST_BETWEEN_SETS" }),
    ).toBeTruthy();
  });

  it("dit tours dans tout le bloc dès qu'une semaine le fait à plusieurs, même là où il est seul", () => {
    const single = {
      baseline: {
        settings: SETTINGS,
        exercises: [{ key: "a", exerciseId: "ex-a", note: null, grid: gridOf(8) }],
      },
    };
    const alone = {
      ...W1,
      blocks: [blockOf([planned("w1-a", "a", gridOf(8, 8))], single)],
      exercises: [row("w1-a", "Tractions")],
    } as unknown as ScheduledSessionCopyDto;
    const more = { ...SETTINGS, repeat: { ...SETTINGS.repeat, rounds: 5 } };
    const both = {
      ...W2,
      blocks: [
        blockOf([planned("w2-a", "a", gridOf(10)), planned("w2-n", "n", gridOf(12))], {
          ...single,
          settings: more,
        }),
      ],
    } as unknown as ScheduledSessionCopyDto;
    const view = render([alone, both]);

    expect(view.getByRole("rowheader", { name: "plan.dosage.setting.ROUNDS" })).toBeTruthy();
    expect(view.queryByRole("rowheader", { name: "plan.dosage.setting.SETS" })).toBeNull();
    // La semaine restée seule dit « tours » aussi : sa phrase porte la clé des tours, pas des séries.
    expect(view.getAllByText(/restBetweenRounds/)).toHaveLength(2);
    expect(view.queryByText(/restBetweenSets/)).toBeNull();
  });

  it("règle un repos en durée, et le bouton Fermer referme", async () => {
    const view = render();
    const [rest] = within(rowOf(view, "plan.dosage.setting.REST_BETWEEN_ROUNDS")).getAllByRole(
      "button",
    );

    await view.user.click(rest as HTMLElement);
    const field = view.getByRole("textbox", { name: "plan.dosage.setting.REST_BETWEEN_ROUNDS" });
    await view.user.clear(field);
    await view.user.type(field, "1'30");
    fireEvent.blur(field);

    expect(view.onChange).toHaveBeenLastCalledWith(
      "ss-1",
      { kind: "setting", blockIndex: 0, field: SettingValue.REST_BETWEEN_ROUNDS },
      [90],
    );
    await view.user.click(view.getByRole("button", { name: "common.close" }));
    expect(view.queryByRole("dialog")).toBeNull();
  });

  it("ferme une semaine débriefée, et tout le tableau en lecture", () => {
    const done = { ...W2, status: ScheduledSessionStatus.DONE };
    const locked = render([W1, done]);
    expect(locked.getByText("plan.dosage.debriefed")).toBeTruthy();
    const [open, closed] = within(rowOf(locked, /Tractions/)).getAllByRole("button");
    expect(open).toBeEnabled();
    expect(closed).toBeDisabled();
    locked.unmount();

    const reading = render([W1, W2], { readOnly: true });
    for (const cell of within(rowOf(reading, /Tractions/)).getAllByRole("button")) {
      expect(cell).toBeDisabled();
    }
  });

  it("rend une semaine à la séance-type, ou la rouvre dans le panneau", async () => {
    const view = render();
    const [w1Menu, w2Menu] = view.getAllByRole("button", { name: "plan.dosage.columnActions" });

    await view.user.click(w1Menu as HTMLElement);
    // Rien d'ajusté en S1 : rien à rendre.
    expect(
      view.getByRole("menuitem", { name: "plan.composition.backToSessionType" }),
    ).toBeDisabled();
    await view.user.click(view.getByRole("menuitem", { name: "plan.dosage.compose" }));
    expect(view.onCompose).toHaveBeenCalledWith("ss-1");

    await view.user.click(w2Menu as HTMLElement);
    await view.user.click(
      view.getByRole("menuitem", { name: "plan.composition.backToSessionType" }),
    );
    expect(view.onRevertCopy).toHaveBeenCalledWith("ss-2");
  });
});

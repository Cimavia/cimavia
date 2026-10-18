import {
  AdjustmentLevel,
  ApiError,
  BlockType,
  cellPath,
  type ExerciseBlocks,
  type ExerciseDto,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
  type SessionDto,
  type SessionExerciseDto,
  STALE_WRITE,
  structurePath,
} from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { type SessionDraft, useSessionDraft } from "./useSessionDraft";

const { createSessionMock, updateSessionMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  createSession: createSessionMock,
  updateSession: updateSessionMock,
}));

const SERIES = "block-series";
const FREE = "block-free";

const metric = (id: string, key: MetricKey) => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit: MetricUnit.NONE,
  label: null,
  collapsed: false,
});

/**
 * Deux blocs, deux lignes : chaque geste doit laisser intacts le bloc et la ligne qu'il ne vise
 * pas. `rest` manque aux valeurs de r2 — une métrique ajoutée après coup n'a pas de défaut.
 */
const blocks: ExerciseBlocks = [
  {
    id: SERIES,
    label: null,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 120 },
    metrics: [metric("reps", MetricKey.REPETITIONS), metric("rest", MetricKey.REST_BETWEEN_SETS)],
    rows: [
      { id: "r1", values: { reps: 5, rest: 90 } },
      { id: "r2", values: { reps: 3 } },
    ],
  },
  { id: FREE, label: null, structure: { type: BlockType.FREE }, metrics: [], rows: [] },
] as unknown as ExerciseBlocks;

const composed = (over: Partial<SessionExerciseDto> = {}): SessionExerciseDto => ({
  id: "sx-tractions",
  exerciseId: "ex-tractions",
  position: 0,
  note: null,
  blocks,
  baseline: blocks,
  adjustments: [],
  title: "Tractions",
  customMetrics: [],
  tags: ["force"],
  frozenFrom: null,
  ...over,
});

const TRACTIONS = composed();
const GAINAGE = composed({
  id: "sx-gainage",
  exerciseId: "ex-gainage",
  position: 1,
  note: "Gainage lent",
  title: "Gainage",
  tags: [],
});

const session = (exercises: SessionExerciseDto[] = [TRACTIONS, GAINAGE]): SessionDto => ({
  id: "session-1",
  coachId: "coach-1",
  owner: { id: "coach-1", name: "Coach" },
  myAccess: { level: "OWNER", via: null },
  grants: [],
  coachGrants: [],
  title: "Force",
  notes: null,
  exercises,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

function renderDraft(initial: SessionDto | null = session(), added: ExerciseDto | null = null) {
  const { wrapper } = renderWithQueryClient();
  return renderHook(() => useSessionDraft(initial, added), { wrapper });
}

/** L'item d'une ligne enregistrée, ou un échec lisible. */
function itemOf(result: { current: SessionDraft }, id: string) {
  const item = result.current.items.find((candidate) => candidate.id === id);
  if (item == null) throw new Error(`item ${id} absent`);
  return item;
}

const seriesOf = (blocksOf: ExerciseBlocks) => blocksOf.find((block) => block.id === SERIES);
const rowOf = (blocksOf: ExerciseBlocks, rowId: string) =>
  seriesOf(blocksOf)?.rows.find((row) => row.id === rowId);

beforeEach(() => {
  vi.clearAllMocks();
  createSessionMock.mockResolvedValue(session());
  updateSessionMock.mockResolvedValue(session());
});

describe("useSessionDraft — état initial", () => {
  it("part vide sans séance", () => {
    const { result } = renderDraft(null);

    expect(result.current.title).toBe("");
    expect(result.current.notes).toBe("");
    expect(result.current.items).toEqual([]);
  });

  it("reprend la composition enregistrée, la clé locale étant l'id de la ligne", () => {
    const { result } = renderDraft(session());

    expect(result.current.title).toBe("Force");
    expect(result.current.items.map((item) => [item.key, item.id, item.note])).toEqual([
      ["sx-tractions", "sx-tractions", ""],
      ["sx-gainage", "sx-gainage", "Gainage lent"],
    ]);
  });

  // Retour de l'exercice créé depuis la séance (#303) : il arrive EN PLUS, à la fin, à enregistrer.
  it("ajoute en dernier l'exercice créé depuis la séance, sans id de ligne", () => {
    const created = { id: "ex-dips", title: "Dips", tags: [], blocks } as unknown as ExerciseDto;
    const { result, rerender } = renderDraft(session(), created);
    rerender();

    expect(result.current.items.map((item) => [item.exerciseId, item.id])).toEqual([
      ["ex-tractions", "sx-tractions"],
      ["ex-gainage", "sx-gainage"],
      ["ex-dips", undefined],
    ]);
    expect(result.current.items[2]).toMatchObject({ blocks, baseline: blocks, adjustments: [] });
  });

  it("expose le titre tel que tapé, et rogné", () => {
    const { result } = renderDraft();

    act(() => result.current.setTitle("  Bloc force  "));

    expect(result.current.title).toBe("  Bloc force  ");
    expect(result.current.trimmedTitle).toBe("Bloc force");
  });
});

describe("useSessionDraft — recharger depuis la bibliothèque (#300)", () => {
  // Ce que le serveur renvoie : Gainage réécrit depuis la bibliothèque, Tractions dans son
  // DERNIER ÉTAT ENREGISTRÉ — donc sans les modifications locales du coach.
  const libraryBlocks = [
    { ...blocks[0], rows: [{ id: "r9", values: { reps: 12, rest: 60 } }] },
  ] as unknown as ExerciseBlocks;
  const reloaded = session([
    TRACTIONS,
    { ...GAINAGE, blocks: libraryBlocks, baseline: libraryBlocks },
  ]);

  it("ne reprend que la ligne rechargée : l'autre garde ses modifications locales", () => {
    const { result } = renderDraft(
      session([
        TRACTIONS,
        { ...GAINAGE, adjustments: [{ path: "x", level: AdjustmentLevel.SESSION }] },
      ]),
    );

    act(() => {
      result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8);
      result.current.setStructure("sx-tractions", SERIES, {
        type: BlockType.SERIES,
        setCount: 5,
        restBetweenSetsSeconds: 120,
      });
    });
    const before = itemOf(result, "sx-tractions");

    act(() => result.current.applyReloaded("sx-gainage", reloaded));

    const tractions = itemOf(result, "sx-tractions");
    expect(tractions).toEqual(before);
    expect(rowOf(tractions.blocks, "r1")?.values.reps).toBe(8);
    expect(tractions.adjustments.map((adjustment) => adjustment.path)).toEqual([
      cellPath(SERIES, "r1", "reps"),
      structurePath(SERIES, "setCount"),
    ]);

    const gainage = itemOf(result, "sx-gainage");
    expect(gainage.blocks).toEqual(libraryBlocks);
    expect(gainage.baseline).toEqual(libraryBlocks);
    expect(gainage.adjustments).toEqual([]);
    // La note n'est pas touchée par le rechargement : elle reste locale.
    expect(gainage.note).toBe("Gainage lent");
  });

  it("la ligne rechargée reprend les métriques que cite désormais l'exercice (#605)", () => {
    const prises = {
      id: "cm-prises",
      label: "Prises",
      unit: null,
      valueType: MetricValueType.NUMBER,
      scale: null,
    };
    const { result } = renderDraft();

    act(() =>
      result.current.applyReloaded(
        "sx-gainage",
        session([TRACTIONS, { ...GAINAGE, customMetrics: [prises] }]),
      ),
    );

    expect(itemOf(result, "sx-gainage").customMetrics).toEqual([prises]);
    expect(itemOf(result, "sx-tractions").customMetrics).toEqual([]);
  });

  it("ne bouge rien si la ligne rechargée manque à la réponse", () => {
    const { result } = renderDraft();
    const before = result.current.items;

    act(() => result.current.applyReloaded("sx-inconnue", reloaded));

    expect(result.current.items).toBe(before);
  });
});

describe("useSessionDraft — composer", () => {
  const exercise = {
    id: "ex-dips",
    title: "Dips",
    tags: ["poussée"],
    blocks,
  } as unknown as ExerciseDto;

  it("ajoute un exercice sans id, sa copie servant de référence", () => {
    const { result } = renderDraft();

    act(() => result.current.addExercise(exercise));

    const added = result.current.items[2];
    expect(added).toMatchObject({
      exerciseId: "ex-dips",
      title: "Dips",
      tags: ["poussée"],
      note: "",
      blocks,
      baseline: blocks,
      adjustments: [],
    });
    expect(added).not.toHaveProperty("id");
    expect(added?.key).not.toBe("");
  });

  it("retire une ligne par sa clé", () => {
    const { result } = renderDraft();

    act(() => result.current.removeItem("sx-tractions"));

    expect(result.current.items.map((item) => item.key)).toEqual(["sx-gainage"]);
  });

  it("déplace une ligne", () => {
    const { result } = renderDraft();

    act(() => result.current.moveItem(0, 1));

    expect(result.current.items.map((item) => item.key)).toEqual(["sx-gainage", "sx-tractions"]);
  });

  it.each([
    ["vers le haut depuis la première", 0, -1],
    ["vers le bas depuis la dernière", 1, 2],
  ])("ne déplace rien %s", (_label, from, to) => {
    const { result } = renderDraft();
    const before = result.current.items;

    act(() => result.current.moveItem(from, to));

    expect(result.current.items).toBe(before);
  });

  // Aucun appelant ne passe une source hors liste (#512) : l'ordre reste intact, sans garde dédiée.
  it("ne déplace rien depuis une position qui n'existe pas", () => {
    const { result } = renderDraft();
    const before = result.current.items;

    act(() => result.current.moveItem(5, 0));

    expect(result.current.items).toEqual(before);
  });

  it("remplace les lignes d'un bloc sans toucher aux autres", () => {
    const { result } = renderDraft();
    const rows = [{ id: "r1", values: { reps: 10 } }] as ExerciseBlocks[number]["rows"];

    act(() => result.current.setRows("sx-tractions", SERIES, rows));

    const tractions = itemOf(result, "sx-tractions");
    expect(seriesOf(tractions.blocks)?.rows).toEqual(rows);
    expect(tractions.blocks[1]).toBe(blocks[1]);
    expect(itemOf(result, "sx-gainage").blocks).toBe(blocks);
  });
});

describe("useSessionDraft — cellules de grille", () => {
  it("écrit la valeur et pose le marqueur sur une ligne de la référence", () => {
    const { result } = renderDraft();

    act(() => result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8));

    const tractions = itemOf(result, "sx-tractions");
    expect(rowOf(tractions.blocks, "r1")?.values).toEqual({ reps: 8, rest: 90 });
    expect(rowOf(tractions.blocks, "r2")).toBe(rowOf(blocks, "r2"));
    expect(tractions.blocks[1]).toBe(blocks[1]);
    expect(tractions.adjustments).toEqual([
      { path: cellPath(SERIES, "r1", "reps"), level: AdjustmentLevel.SESSION },
    ]);
  });

  it("ne marque pas une ligne ajoutée dans la séance : elle ne s'écarte d'aucun défaut", () => {
    const { result } = renderDraft();
    const added = [...(seriesOf(blocks)?.rows ?? []), { id: "r3", values: { reps: 1 } }];

    act(() => {
      result.current.setRows("sx-tractions", SERIES, added as ExerciseBlocks[number]["rows"]);
      result.current.setCellValue("sx-tractions", SERIES, "r3", "reps", 2);
    });

    const tractions = itemOf(result, "sx-tractions");
    expect(rowOf(tractions.blocks, "r3")?.values.reps).toBe(2);
    expect(tractions.adjustments).toEqual([]);
  });

  it("ne marque pas une cellule d'un bloc absent de la référence", () => {
    const { result } = renderDraft(session([composed({ baseline: [] })]));

    act(() => result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8));

    expect(itemOf(result, "sx-tractions").adjustments).toEqual([]);
  });

  it("« Revenir au défaut » sur une cellule reprend la valeur de référence et retire le marqueur", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8);
      result.current.revertCell("sx-tractions", SERIES, "r1", "reps");
    });

    const tractions = itemOf(result, "sx-tractions");
    expect(rowOf(tractions.blocks, "r1")?.values).toEqual({ reps: 5, rest: 90 });
    expect(rowOf(tractions.blocks, "r2")).toBe(rowOf(blocks, "r2"));
    expect(tractions.blocks[1]).toBe(blocks[1]);
    expect(tractions.adjustments).toEqual([]);
  });

  it("revient à vide sur une métrique que la référence ne renseigne pas", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setCellValue("sx-tractions", SERIES, "r2", "rest", 60);
      result.current.revertCell("sx-tractions", SERIES, "r2", "rest");
    });

    expect(rowOf(itemOf(result, "sx-tractions").blocks, "r2")?.values).toEqual({
      reps: 3,
      rest: null,
    });
  });

  it("ne fait rien sur une cellule d'une ligne absente de la référence", () => {
    const { result } = renderDraft();
    const before = itemOf(result, "sx-tractions");

    act(() => result.current.revertCell("sx-tractions", SERIES, "r-inconnue", "reps"));

    expect(itemOf(result, "sx-tractions")).toBe(before);
  });

  it("« Revenir au défaut » sur une ligne reprend toutes ses valeurs", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8);
      result.current.setCellValue("sx-tractions", SERIES, "r1", "rest", 30);
      result.current.revertRow("sx-tractions", SERIES, "r1");
    });

    const tractions = itemOf(result, "sx-tractions");
    expect(rowOf(tractions.blocks, "r1")?.values).toEqual({ reps: 5, rest: 90 });
    expect(tractions.adjustments).toEqual([]);
  });
});

describe("useSessionDraft — bandeau", () => {
  const series = (setCount: number) => ({
    type: BlockType.SERIES,
    setCount,
    restBetweenSetsSeconds: 120,
  });

  it("marque le seul paramètre qui s'écarte de la référence", () => {
    const { result } = renderDraft();

    act(() => result.current.setStructure("sx-tractions", SERIES, series(5)));

    const tractions = itemOf(result, "sx-tractions");
    expect(seriesOf(tractions.blocks)?.structure).toEqual(series(5));
    expect(tractions.blocks[1]).toBe(blocks[1]);
    expect(tractions.adjustments).toEqual([
      { path: structurePath(SERIES, "setCount"), level: AdjustmentLevel.SESSION },
    ]);
  });

  it("retire le marqueur quand la valeur revient à la main à celle de la référence", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setStructure("sx-tractions", SERIES, series(5));
      result.current.setStructure("sx-tractions", SERIES, series(4));
    });

    expect(itemOf(result, "sx-tractions").adjustments).toEqual([]);
  });

  // Comme une ligne ajoutée (#518) : sans référence, aucun défaut dont s'écarter, donc aucun
  // marqueur — c'est le cas d'un exercice ajouté dans une séance planifiée.
  it("ne marque rien sur un bloc absent de la référence", () => {
    const { result } = renderDraft(session([composed({ baseline: [] })]));

    act(() => result.current.setStructure("sx-tractions", SERIES, series(5)));

    expect(seriesOf(itemOf(result, "sx-tractions").blocks)?.structure).toEqual(series(5));
    expect(itemOf(result, "sx-tractions").adjustments).toEqual([]);
  });

  it("« Revenir au défaut » sur un paramètre reprend sa valeur et retire son marqueur", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setStructure("sx-tractions", SERIES, series(5));
      result.current.revertStructureField("sx-tractions", SERIES, "setCount");
    });

    const tractions = itemOf(result, "sx-tractions");
    expect(seriesOf(tractions.blocks)?.structure).toEqual(series(4));
    expect(tractions.blocks[1]).toBe(blocks[1]);
    expect(tractions.adjustments).toEqual([]);
  });

  it("ne fait rien sur un paramètre d'un bloc absent de la référence", () => {
    const { result } = renderDraft(session([composed({ baseline: [] })]));
    const before = itemOf(result, "sx-tractions");

    act(() => result.current.revertStructureField("sx-tractions", SERIES, "setCount"));

    expect(itemOf(result, "sx-tractions")).toBe(before);
  });
});

describe("useSessionDraft — tout réinitialiser", () => {
  it("revient aux valeurs copiées à l'ajout, sans toucher à la référence", () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setCellValue("sx-tractions", SERIES, "r1", "reps", 8);
      result.current.setStructure("sx-tractions", SERIES, {
        type: BlockType.SERIES,
        setCount: 5,
        restBetweenSetsSeconds: 120,
      });
      result.current.resetItem("sx-tractions");
    });

    const tractions = itemOf(result, "sx-tractions");
    expect(tractions.blocks).toEqual(blocks);
    expect(tractions.baseline).toBe(blocks);
    expect(tractions.adjustments).toEqual([]);
  });
});

describe("useSessionDraft — enregistrer", () => {
  it("met à jour une séance existante : ids gardés, textes rognés, vides envoyés à null", async () => {
    const { result } = renderDraft();

    act(() => {
      result.current.setTitle("  Force max  ");
      result.current.setNotes("   ");
      result.current.addExercise({
        id: "ex-dips",
        title: "Dips",
        tags: [],
        blocks,
      } as unknown as ExerciseDto);
    });
    await act(() => result.current.submit());

    expect(updateSessionMock).toHaveBeenCalledWith("session-1", {
      title: "Force max",
      notes: null,
      exercises: [
        { id: "sx-tractions", exerciseId: "ex-tractions", note: null, blocks, adjustments: [] },
        {
          id: "sx-gainage",
          exerciseId: "ex-gainage",
          note: "Gainage lent",
          blocks,
          adjustments: [],
        },
        // Une ligne neuve part SANS id : le serveur lui pose une référence copiée de l'exercice.
        { exerciseId: "ex-dips", note: null, blocks, adjustments: [] },
      ],
      expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("crée la séance quand il n'y en a pas encore", async () => {
    const { result } = renderDraft(null);

    act(() => {
      result.current.setTitle("Nouvelle");
      result.current.setNotes("  Échauffement long  ");
    });
    await act(() => result.current.submit());

    expect(createSessionMock).toHaveBeenCalledWith({
      title: "Nouvelle",
      notes: "Échauffement long",
      exercises: [],
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });
});

describe("useSessionDraft — la version citée (#604)", () => {
  const SAVED = "2026-10-12T08:05:00.000Z";
  const RELOADED = "2026-10-12T08:07:00.000Z";

  const versionsCited = () =>
    updateSessionMock.mock.calls.map(([, input]) => input.expectedUpdatedAt);

  it("cite au second enregistrement la version écrite par le premier", async () => {
    updateSessionMock.mockResolvedValue({ ...session(), updatedAt: SAVED });
    const { result } = renderDraft();

    await act(() => result.current.submit());
    act(() => result.current.setTitle("Force (v2)"));
    await act(() => result.current.submit());

    expect(versionsCited()).toEqual(["2026-09-01T00:00:00.000Z", SAVED]);
  });

  // Sans ça, rester sur l'écran après une création — un détour raté — en créerait une seconde.
  it("passe en édition après une création, et cite sa version", async () => {
    createSessionMock.mockResolvedValue({ ...session([]), updatedAt: SAVED });
    const { result } = renderDraft(null);

    act(() => result.current.setTitle("Nouvelle"));
    await act(() => result.current.submit());
    await act(() => result.current.submit());

    expect(createSessionMock).toHaveBeenCalledOnce();
    expect(updateSessionMock).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expectedUpdatedAt: SAVED }),
    );
  });

  // Le rechargement d'un exercice est une écriture : la suivante part de la version qu'il a posée.
  it("cite la version posée par un rechargement d'exercice", async () => {
    const { result } = renderDraft();

    act(() => result.current.applyReloaded("sx-tractions", { ...session(), updatedAt: RELOADED }));
    expect(result.current.edited?.updatedAt).toBe(RELOADED);
    await act(() => result.current.submit());

    expect(versionsCited()).toEqual([RELOADED]);
  });

  /**
   * Le remplace-all recrée les lignes sous de nouveaux ids : un écran resté ouvert doit envoyer
   * ceux-là, sans quoi chaque ligne perdrait sa référence de dosage au second enregistrement.
   */
  it("reprend les ids que l'enregistrement a recréés, sans se dire modifié", async () => {
    updateSessionMock.mockResolvedValueOnce({
      ...session([
        { ...TRACTIONS, id: "sx-tractions-2" },
        { ...GAINAGE, id: "sx-gainage-2" },
      ]),
      updatedAt: SAVED,
    });
    const { result } = renderDraft();

    await act(() => result.current.submit());
    expect(result.current.isDirty).toBe(false);
    await act(() => result.current.submit());

    const [, second] = updateSessionMock.mock.calls;
    expect(second?.[1].exercises.map((line: { id?: string }) => line.id)).toEqual([
      "sx-tractions-2",
      "sx-gainage-2",
    ]);
  });

  it("ne se dit périmé que sur un refus de version, pas sur un autre 409", async () => {
    const { result } = renderDraft();

    updateSessionMock.mockRejectedValueOnce(new ApiError(409, "Autre conflit", null));
    await act(async () => {
      await expect(result.current.submit()).rejects.toThrow();
    });
    // L'état de la mutation se publie un tick après le rejet.
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isStale).toBe(false);

    updateSessionMock.mockRejectedValueOnce(new ApiError(409, STALE_WRITE, null));
    await act(async () => {
      await expect(result.current.submit()).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.isStale).toBe(true));
  });
});

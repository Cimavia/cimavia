import { describe, expect, it } from "vitest";
import { GRID_MAX_ROWS } from "../dto/block-grid.schema";
import { ColumnFillMode, fillRows, withCellValue, withMaterializedSeries } from "./grid-fill.util";

const rows = (...reps: (number | string | null)[]) =>
  reps.map((value, index) => ({ id: `r${index}`, values: { col_reps: value } }));

const column = (filled: ReturnType<typeof fillRows>, metricId = "col_reps") =>
  filled.map((row) => row.values[metricId]);

describe("fillRows", () => {
  it("pose la même valeur partout", () => {
    const filled = fillRows(rows(6, 5, 4), "col_reps", { mode: ColumnFillMode.SAME, value: 8 });
    expect(column(filled)).toEqual([8, 8, 8]);
  });

  it.each([
    ["une progression régulière", 8, 2, 4, [8, 10, 12, 14]],
    ["un pas négatif — une série dégressive", 12, -2, 3, [12, 10, 8]],
    ["un pas décimal", 10, 2.5, 4, [10, 12.5, 15, 17.5]],
    // 0 + 3 × 0,1 vaut 0,30000000000000004 en virgule flottante : la cellule ne doit pas le dire.
    ["un pas qui ferait apparaître l'erreur d'arrondi", 1.1, 0.1, 5, [1.1, 1.2, 1.3, 1.4, 1.5]],
    ["un départ décimal et un pas entier", 0.25, 1, 3, [0.25, 1.25, 2.25]],
    ["un nombre qu'il ne sait pas arrondir", 1e-7, 1e-7, 2, [1e-7, 2e-7]],
  ])("progresse sur %s", (_, start, step, count, expected) => {
    const filled = fillRows(rows(...Array<null>(count).fill(null)), "col_reps", {
      mode: ColumnFillMode.STEP,
      start,
      step,
    });
    expect(column(filled)).toEqual(expected);
  });

  it("progresse sur l'échelle et BUTE sur le dernier palier", () => {
    // Reboucler à « 5a » après le sommet produirait une consigne absurde que rien ne signalerait.
    const filled = fillRows(rows(null, null, null, null), "col_reps", {
      mode: ColumnFillMode.SCALE_STEP,
      scale: ["5a", "5b", "6a"],
      start: "5a",
      step: 1,
    });
    expect(column(filled)).toEqual(["5a", "5b", "6a", "6a"]);
  });

  it("vide la colonne si le palier de départ n'est pas dans l'échelle", () => {
    const filled = fillRows(rows(null, null), "col_reps", {
      mode: ColumnFillMode.SCALE_STEP,
      scale: ["5a", "5b"],
      start: "V4",
      step: 1,
    });
    expect(column(filled)).toEqual([null, null]);
  });

  it("reflète la première moitié, sans dupliquer le sommet d'une pyramide impaire", () => {
    const filled = fillRows(rows(4, 6, 8, null, null), "col_reps", { mode: ColumnFillMode.MIRROR });
    expect(column(filled)).toEqual([4, 6, 8, 6, 4]);
  });

  it("ne touche PAS aux autres colonnes", () => {
    const filled = fillRows(
      [
        { id: "r1", values: { col_reps: 6, col_load: 12 } },
        { id: "r2", values: { col_reps: 5, col_load: 14 } },
      ],
      "col_reps",
      { mode: ColumnFillMode.SAME, value: 9 },
    );
    expect(column(filled, "col_load")).toEqual([12, 14]);
  });
});

describe("withCellValue", () => {
  const grid = [
    { id: "r1", values: { reps: 6, load: 10 } },
    { id: "r2", values: { reps: 6, load: 10 } },
  ];

  it("réécrit une seule cellule, sans toucher aux autres colonnes ni aux autres lignes", () => {
    expect(withCellValue(grid, "r2", "load", 12.5)).toEqual([
      { id: "r1", values: { reps: 6, load: 10 } },
      { id: "r2", values: { reps: 6, load: 12.5 } },
    ]);
  });

  it("vide une cellule en y posant null, jamais zéro", () => {
    expect(withCellValue(grid, "r1", "load", null)[0]?.values.load).toBeNull();
  });
});

describe("withMaterializedSeries", () => {
  const ids = (index: number) => `new${index}`;

  it("crée les lignes jusqu'à la série visée, en recopiant la dernière", () => {
    const grid = [
      { id: "r1", values: { col_load: 1 } },
      { id: "r2", values: { col_load: 2 } },
    ];
    expect(withMaterializedSeries(grid, 3, ids)).toEqual([
      ...grid,
      { id: "new2", values: { col_load: 2 } },
      { id: "new3", values: { col_load: 2 } },
    ]);
  });

  it("crée des lignes vides sur une grille qui n'en a pas", () => {
    expect(withMaterializedSeries([], 1, ids)).toEqual([
      { id: "new0", values: {} },
      { id: "new1", values: {} },
    ]);
  });

  it("rend les lignes intactes quand la série a déjà la sienne", () => {
    const grid = [{ id: "r1", values: {} }];
    expect(withMaterializedSeries(grid, 0, ids)).toBe(grid);
  });

  it("s'arrête au plafond de lignes", () => {
    expect(withMaterializedSeries([], GRID_MAX_ROWS + 5, ids)).toHaveLength(GRID_MAX_ROWS);
  });
});

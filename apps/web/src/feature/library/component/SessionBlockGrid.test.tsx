import {
  BlockType,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
  type SessionDto,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { useSessionDraft } from "../hook/useSessionDraft";
import { SessionBlockGrid } from "./SessionBlockGrid";

const REVERT = "library.session.revert";

const blocks: ExerciseBlocks = [
  {
    id: "block-1",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
    metrics: [
      {
        id: "reps",
        source: MetricSource.CATALOG,
        key: MetricKey.REPETITIONS,
        unit: MetricUnit.REPS,
        label: null,
        collapsed: false,
      },
      {
        id: "rest",
        source: MetricSource.CATALOG,
        key: MetricKey.REST_BETWEEN_SETS,
        unit: MetricUnit.NONE,
        label: null,
        collapsed: false,
      },
    ],
    rows: [{ id: "r1", values: { reps: 5, rest: null } }],
  },
];

const session = {
  id: "session-1",
  title: "Force",
  notes: null,
  exercises: [
    {
      id: "sx-1",
      exerciseId: "ex-1",
      title: "Traction lestée",
      tags: [],
      note: null,
      blocks,
      baseline: blocks,
      adjustments: [],
    },
  ],
} as unknown as SessionDto;

/**
 * Le VRAI brouillon de séance, et non un parent simulé : #299 naissait de la rencontre entre
 * l'écriture de la cellule, qui pose son marqueur, et l'ajout de ligne, qui remonte les lignes en
 * entier. Seul le brouillon réel les fait se croiser comme à l'écran.
 */
function Harness() {
  const draft = useSessionDraft(session);
  const item = draft.items[0];
  const block = item?.blocks[0];
  if (item == null || block == null) return null;

  return (
    <SessionBlockGrid
      block={block}
      baseline={item.baseline}
      adjustments={item.adjustments}
      customMetrics={[]}
      onCellChange={(rowId, metricId, value) =>
        draft.setCellValue(item.key, block.id, rowId, metricId, value)
      }
      onRowsChange={(rows) => draft.setRows(item.key, block.id, rows)}
      onRevertCell={(rowId, metricId) => draft.revertCell(item.key, block.id, rowId, metricId)}
    />
  );
}

describe("SessionBlockGrid — Entrée sur la dernière ligne", () => {
  it("garde la durée tapée, la recopie dans la ligne créée, et marque la seule cellule ajustée", async () => {
    const { user, getAllByRole } = renderWithProviders(<Harness />);

    await user.type(getAllByRole("textbox")[1] as HTMLElement, "2:30{Enter}");

    const cells = getAllByRole("textbox");
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveValue("2'30");
    expect(cells[3]).toHaveValue("2'30");
    // La ligne créée n'existe pas dans la référence : elle ne s'écarte d'aucun défaut, donc un
    // seul marqueur — celui de la cellule tapée.
    expect(getAllByRole("button", { name: REVERT })).toHaveLength(1);
  });
});

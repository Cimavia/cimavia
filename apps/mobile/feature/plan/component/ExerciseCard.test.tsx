import type { ExerciseBlock, ExerciseTracking, ScheduledSessionExerciseDto } from "@cmv/shared";
import {
  BlockType,
  DocumentType,
  DocumentUsage,
  exerciseBlockSchema,
  MetricKey,
  MetricSource,
  MetricUnit,
  RichBlockType,
} from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { press, pressButton, renderRn } from "../../../test/render";

let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const openDocument = vi.fn<() => Promise<string>>(async () => "opened");
vi.mock("@/feature/plan/lib/open-document", () => ({
  openDocument: (...args: unknown[]) => openDocument(...(args as [])),
}));

const { ExerciseCard } = await import("./ExerciseCard");

function exercise(over: Partial<ScheduledSessionExerciseDto> = {}): ScheduledSessionExerciseDto {
  return {
    id: "ex-1",
    sourceExerciseId: null,
    title: "Tractions lestées",
    description: null,
    instructions: null,
    tracking: null,
    tags: [],
    note: null,
    blocks: [],
    customMetrics: [],
    baseline: [],
    adjustments: [],
    position: 0,
    documents: [
      {
        id: "doc-1",
        type: DocumentType.FILE,
        usage: DocumentUsage.ATTACHMENT,
        url: "https://storage.test/signed",
        fileName: "progression.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    ...over,
  };
}

const reps = {
  id: "col_reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
} as const;

/** Deux séries de gestes, sans repos : rien de minuté, deux cases à cocher. */
const seriesBlock = (): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_series",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 2, restBetweenSetsSeconds: null },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

/** Une échéance unique de 10 min : le bouton, et un compteur de tours en guise de suivi. */
const amrapBlock = (): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_amrap",
    label: null,
    structure: { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds: null },
    metrics: [reps],
    rows: [{ id: "r1", values: { col_reps: 6 } }],
  });

const handlers = { onToggleUnit: vi.fn(), onRounds: vi.fn(), onRun: vi.fn() };

function renderCard(
  over: Partial<ScheduledSessionExerciseDto> = {},
  tracking: ExerciseTracking | null = null,
) {
  return renderRn(
    <ExerciseCard
      exercise={exercise(over)}
      planId="plan-1"
      index={0}
      customMetrics={[]}
      tracking={tracking}
      {...handlers}
    />,
  );
}

const boxes = (container: HTMLElement) => container.querySelectorAll('[role="checkbox"]');

beforeEach(() => {
  vi.clearAllMocks();
  reachable = true;
  openDocument.mockResolvedValue("opened");
});

describe("ExerciseCard — pièces jointes", () => {
  it("ouvre la pièce jointe avec le cycle et l'état du réseau", async () => {
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
    expect(openDocument).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ id: "doc-1" }),
      true,
    );
  });

  it("ne dit rien quand la pièce jointe s'ouvre", async () => {
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalled());
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
    expect(screen.queryByText("plan.session.documentUnavailable")).toBeNull();
  });

  /**
   * Le repli explicite de l'issue : un document jamais descendu, tapé sans réseau, doit DIRE
   * pourquoi il ne s'ouvre pas — pas échouer en silence.
   */
  it("explique le hors-réseau sous la pièce jointe concernée", async () => {
    reachable = false;
    openDocument.mockResolvedValue("offline");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();
  });

  it("distingue une ouverture refusée d'une absence de réseau", async () => {
    openDocument.mockResolvedValue("failed");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentUnavailable")).toBeTruthy();
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
  });

  /**
   * L'échec ne doit pas SURVIVRE à une ouverture réussie : l'athlète qui retrouve du réseau et
   * retape doit voir le message disparaître, sans quoi il croirait l'échec toujours vrai.
   */
  it("efface le message quand une nouvelle tentative aboutit", async () => {
    openDocument.mockResolvedValue("offline");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");
    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();

    openDocument.mockResolvedValue("opened");
    pressButton(container, "progression.pdf");

    await waitFor(() => expect(screen.queryByText("plan.session.documentOffline")).toBeNull());
  });
});

describe("ExerciseCard — l'en-tête", () => {
  it("numérote l'exercice à partir de 1 et montre ses étiquettes", () => {
    renderCard({ tags: ["force", "doigts"] });

    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("force")).toBeTruthy();
    expect(screen.getByText("doigts")).toBeTruthy();
  });

  it("montre la note du coach, et rien quand il n'en a pas écrit", () => {
    const { rerender } = renderCard({ note: "Lest au-dessus de 10 kg." });
    expect(screen.getByText("Lest au-dessus de 10 kg.")).toBeTruthy();

    rerender(
      <ExerciseCard
        exercise={exercise()}
        planId="plan-1"
        index={0}
        customMetrics={[]}
        tracking={null}
        {...handlers}
      />,
    );
    expect(screen.queryByText("Lest au-dessus de 10 kg.")).toBeNull();
  });

  it("nomme un lien sans nom de fichier", () => {
    renderCard({
      documents: [{ ...exercise().documents[0], type: DocumentType.LINK, fileName: null } as never],
    });

    expect(screen.getByText("plan.session.link")).toBeTruthy();
  });
});

describe("ExerciseCard — le lancement", () => {
  /**
   * Ce que la carte transmet au minuteur : les segments ET de quoi rattacher le « Tour fait » à son
   * bloc. Sans le contexte, le déroulé tournerait sans rien pouvoir cocher.
   */
  it("déroule le bloc en entier, avec l'exercice et le bloc qui le portent", () => {
    const block = amrapBlock();
    const { container } = renderCard({ blocks: [block] });

    pressButton(container, "plan.timer.run");

    expect(handlers.onRun).toHaveBeenCalledExactlyOnceWith(
      [expect.objectContaining({ seconds: 600 })],
      { exerciseId: "ex-1", block, customMetrics: [], title: "Tractions lestées" },
    );
  });

  it.each([
    ["des gestes seuls", seriesBlock],
    [
      "un bloc libre sans étape",
      () =>
        exerciseBlockSchema.parse({
          id: "blk_free",
          label: null,
          structure: { type: BlockType.FREE },
          metrics: [reps],
          rows: [],
        }),
    ],
  ])("n'offre rien à lancer sur %s", (_, block) => {
    renderCard({ blocks: [block()] });

    expect(screen.queryByText("plan.timer.run")).toBeNull();
  });
});

describe("ExerciseCard — le suivi", () => {
  /** L'état non suivi reste SILENCIEUX : ni cases, ni « 0 sur 2 ». */
  it("replie les cases d'un exercice pas encore suivi, et les ouvre au tap", () => {
    const { container } = renderCard({ blocks: [seriesBlock()] });
    expect(boxes(container)).toHaveLength(0);
    expect(screen.queryByText("plan.tracking.progress")).toBeNull();

    press(screen.getByText("plan.tracking.open.SET"));

    expect(boxes(container)).toHaveLength(2);
    press(screen.getByText("plan.tracking.hide.SET"));
    expect(boxes(container)).toHaveLength(0);
  });

  it("rapporte la case cochée à son bloc", () => {
    const { container } = renderCard({ blocks: [seriesBlock()] });
    press(screen.getByText("plan.tracking.open.SET"));

    press(boxes(container)[1] as HTMLElement);

    expect(handlers.onToggleUnit).toHaveBeenCalledExactlyOnceWith("blk_series", 1);
  });

  it("rapporte les tours comptés à leur bloc", () => {
    renderCard({ blocks: [amrapBlock()] }, { blk_amrap: { rounds: 3 } });

    press(screen.getByLabelText("plan.tracking.roundsPlus"));

    expect(handlers.onRounds).toHaveBeenCalledExactlyOnceWith("blk_amrap", 4);
  });

  /** Un suivi déjà commencé s'ouvre d'office : l'athlète retrouve ses cases là où il les a laissées. */
  it("ouvre d'office un suivi commencé, avancement compris", () => {
    const { container } = renderCard({ blocks: [seriesBlock()] }, { blk_series: { checked: [0] } });

    expect(boxes(container)).toHaveLength(2);
    expect(screen.getByText("plan.tracking.progress")).toBeTruthy();
  });

  /** Un suivi ouvert sans rien de coché n'a pas d'avancement à dire. */
  it("tait l'avancement tant que rien n'est coché", () => {
    const { container } = renderCard({ blocks: [seriesBlock()] }, { blk_series: { checked: [] } });

    expect(boxes(container)).toHaveLength(2);
    expect(screen.queryByText("plan.tracking.progress")).toBeNull();
  });

  it("propose de revoir un suivi terminé une fois replié", () => {
    renderCard({ blocks: [seriesBlock()] }, { blk_series: { checked: [0, 1] } });

    press(screen.getByText("plan.tracking.hide.SET"));

    expect(screen.getByText("plan.tracking.review.SET")).toBeTruthy();
  });

  it("n'affiche aucun lien de suivi sur un exercice sans bloc", () => {
    const { container } = renderCard();

    expect(container.textContent).not.toContain("plan.tracking");
  });
});

describe("ExerciseCard — la consigne", () => {
  const instructions = [{ type: RichBlockType.PARAGRAPH, content: [{ text: "Pieds à plat." }] }];

  it.each([
    ["absente", null],
    ["vide", []],
  ])("n'offre aucun lien vers une consigne %s", (_, value) => {
    renderCard({ instructions: value as never });

    expect(screen.queryByText("plan.session.showInstructions")).toBeNull();
  });

  /** Repliée par défaut : l'athlète au mur veut d'abord son dosage. */
  it("replie la consigne, puis la déplie et la replie au tap", () => {
    renderCard({ instructions: instructions as never });
    expect(screen.queryByText("Pieds à plat.")).toBeNull();

    press(screen.getByText("plan.session.showInstructions"));
    expect(screen.getByText("Pieds à plat.")).toBeTruthy();

    press(screen.getByText("plan.session.hideInstructions"));
    expect(screen.queryByText("Pieds à plat.")).toBeNull();
  });
});

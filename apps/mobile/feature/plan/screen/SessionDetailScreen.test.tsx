import type {
  BlockSegment,
  ExerciseBlock,
  ScheduledSessionDto,
  ScheduledSessionExerciseDto,
} from "@cmv/shared";
import {
  BlockType,
  MetricKey,
  MetricSource,
  MetricUnit,
  ScheduledSessionStatus,
} from "@cmv/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import type { RunnerContext } from "@/feature/plan/hook/useSegmentRunner";
import { SessionDetailScreen } from "@/feature/plan/screen/SessionDetailScreen";
import { press, pressButton, renderRn } from "@/test/render";
import { storedItems } from "@/test/setup";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: vi.fn() }));
/** Les segments que le déclencheur « scripté » lance : chaque cas les pose avant de presser. */
const { scripted } = vi.hoisted(() => ({ scripted: { segments: [] as BlockSegment[] } }));
// Le bandeau hors-ligne écoute l'état réseau : hors sujet ici, et il n'a rien à dire d'un test.
vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));
/**
 * La carte d'exercice est réduite à son titre et à deux déclencheurs de déroulé : elle a SON
 * fichier de test, et la monter pour de vrai ferait entrer ici les documents et le réseau — deux
 * sujets que cet écran ne décide pas. Ce qu'on garde d'elle, c'est ce que l'écran en attend : un
 * rendu par exercice, et le `onRun` par lequel le chrono démarre.
 *
 * Les segments sont bâtis DANS la fabrique : `vi.mock` est hissé au-dessus des imports, et y citer
 * `SegmentKind` lèverait au chargement. Les littéraux valent l'énumération, les types font le
 * reste — ils s'effacent à la compilation.
 *
 * Un exercice qui porte des blocs a en plus un déclencheur par bloc, câblé comme la vraie carte :
 * les segments sortent du VRAI `blockSegments`. C'est ce qui laisse éprouver le déroulé et le
 * suivi ensemble, sur la forme exacte que la carte leur donne.
 *
 * Le déclencheur « scripté » lance ce que le cas a posé dans `scripted` : un segment manuel au
 * milieu, un déroulé plus long que le plafond — des formes qu'aucun bloc simple ne donne.
 *
 * Chaque bloc porte enfin les deux gestes de suivi de la carte — cocher sa première unité, compter
 * deux tours —, pour éprouver ce que l'écran en fait : les persister, et fermer l'amorçage.
 */
vi.mock("@/feature/plan/component/ExerciseCard", async () => {
  const { blockSegments } = await vi.importActual<typeof import("@cmv/shared")>("@cmv/shared");

  const segment = (kind: string, seconds: number, unitIndex: number | null): BlockSegment =>
    ({ kind, seconds, unitIndex, rowId: null }) as unknown as BlockSegment;

  const context: RunnerContext = {
    exerciseId: "ex-1",
    title: "Tractions",
    customMetrics: [],
    block: { id: "b-1", label: null, structure: { type: "FREE" }, metrics: [], rows: [] },
  } as unknown as RunnerContext;

  return {
    ExerciseCard: ({
      exercise,
      onRun,
      onToggleUnit,
      onRounds,
    }: Readonly<{
      exercise: ScheduledSessionExerciseDto;
      onRun: (segments: readonly BlockSegment[], context: RunnerContext) => void;
      onToggleUnit: (blockId: string, unitIndex: number) => void;
      onRounds: (blockId: string, rounds: number) => void;
    }>) => (
      <>
        <span>{exercise.title}</span>
        <button
          type="button"
          onClick={() => onRun([segment("EFFORT", 30, 0), segment("REST", 60, null)], context)}
        >
          {`lancer un enchaînement ${exercise.id}`}
        </button>
        <button type="button" onClick={() => onRun([segment("REST", 60, null)], context)}>
          {`lancer un repos seul ${exercise.id}`}
        </button>
        <button type="button" onClick={() => onRun(scripted.segments, context)}>
          {`lancer le déroulé scripté ${exercise.id}`}
        </button>
        {exercise.blocks.map((block) => (
          <span key={block.id}>
            <button
              type="button"
              onClick={() =>
                onRun(blockSegments(block), {
                  exerciseId: exercise.id,
                  block,
                  customMetrics: exercise.customMetrics,
                  title: exercise.title,
                })
              }
            >
              {`dérouler ${block.id}`}
            </button>
            <button type="button" onClick={() => onToggleUnit(block.id, 0)}>
              {`cocher ${block.id}`}
            </button>
            <button type="button" onClick={() => onRounds(block.id, 2)}>
              {`compter ${block.id}`}
            </button>
          </span>
        ))}
      </>
    ),
  };
});

const SESSION_ID = "ss-1";

function exercise(id: string, title: string): ScheduledSessionExerciseDto {
  return {
    id,
    sourceExerciseId: null,
    title,
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
    documents: [],
  };
}

function session(overrides: Partial<ScheduledSessionDto> = {}): ScheduledSessionDto {
  return {
    id: SESSION_ID,
    planId: "p-1",
    planWeekId: "pw-1",
    sourceSessionId: null,
    title: "Force haut du corps",
    notes: null,
    scheduledDate: "2026-10-13",
    position: 0,
    status: ScheduledSessionStatus.PLANNED,
    exerciseCount: overrides.exercises?.length ?? 0,
    exercises: [],
    ...overrides,
  };
}

/**
 * `useScheduledSession` rend un `useQuery` : l'écran en lit cinq champs, et les quatre états qu'il
 * distingue (chargement, erreur sèche, chargé, rafraîchissement) se jouent sur eux seuls.
 */
function query(state: Partial<UseQueryResult<ScheduledSessionDto>>) {
  vi.mocked(useScheduledSession).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...state,
  } as UseQueryResult<ScheduledSessionDto>);
}

const loaded = (overrides: Partial<ScheduledSessionDto> = {}) =>
  query({ data: session(overrides) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: SESSION_ID });
});

describe("SessionDetailScreen", () => {
  /**
   * Le cœur de #276. Une séance sans exercice — un footing, du repos actif — se compose comme ça,
   * et le débrief y est le SEUL geste qui reste : c'est par lui que la trace part au coach. Rien
   * côté serveur n'y a jamais fait obstacle, la garde était purement cliente.
   */
  it("ouvre le débrief d'une séance sans exercice", async () => {
    loaded({ exercises: [] });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.open")).toBeTruthy();
  });

  it("mène au débrief de CETTE séance", async () => {
    loaded({ exercises: [] });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("feedback.open");

    pressButton(container, "feedback.open");

    expect(router.push).toHaveBeenCalledWith(`/session/${SESSION_ID}/feedback`);
  });

  // Le libellé suit le STATUT — « débriefer » sur une séance déjà débriefée laisserait croire
  // qu'on écrase. Jamais la composition : c'est l'erreur que #276 corrige.
  it("dit que le débrief existe déjà, même sans exercice", async () => {
    loaded({ exercises: [], status: ScheduledSessionStatus.DONE });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.openDone")).toBeTruthy();
  });

  // On constate le vide sans désigner de coupable, et sans rien retirer.
  it("constate l'absence de déroulé sans retirer le débrief", async () => {
    loaded({ exercises: [] });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("plan.session.emptyTitle")).toBeTruthy();
    expect(queryByText("feedback.open")).toBeTruthy();
  });

  it("rend un exercice par ligne, et alors aucun état vide", async () => {
    loaded({ exercises: [exercise("ex-1", "Tractions"), exercise("ex-2", "Rowing")] });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("Tractions")).toBeTruthy();
    expect(queryByText("Rowing")).toBeTruthy();
    expect(queryByText("plan.session.emptyTitle")).toBeNull();
  });

  // Les consignes du coach sont NULLABLES : pas d'encart vide quand il n'y en a pas.
  it("montre les consignes du coach", async () => {
    loaded({ notes: "Échauffe les épaules." });
    const { findByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("Échauffe les épaules.")).toBeTruthy();
  });

  it("n'ouvre pas d'encart de consignes sur une séance qui n'en porte pas", async () => {
    loaded({ notes: null });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    await findByText("Force haut du corps");

    expect(queryByText("plan.session.notes")).toBeNull();
  });

  it("n'affirme rien tant que la séance charge", () => {
    query({ isPending: true });
    const { queryByText } = renderRn(<SessionDetailScreen />);

    expect(queryByText("feedback.open")).toBeNull();
    expect(queryByText("plan.session.emptyTitle")).toBeNull();
  });

  /**
   * Erreur SÈCHE — sans donnée en cache. Une erreur survenue sur un rafraîchissement laisse au
   * contraire la séance lisible : c'est ce que garde la condition `session == null`.
   */
  it("propose de reprendre quand la séance n'a pas pu être lue", async () => {
    const refetch = vi.fn();
    query({ isError: true, refetch: refetch as UseQueryResult<ScheduledSessionDto>["refetch"] });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("common.retry");

    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("se rafraîchit quand on tire la séance", async () => {
    const refetch = vi.fn();
    query({ data: session(), refetch });
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    await findByText("feedback.open");

    press(container.querySelector("[data-refresh]") as HTMLElement);

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("garde la séance lisible quand seul le rafraîchissement échoue", async () => {
    query({ data: session({ exercises: [] }), isError: true });
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);

    expect(await findByText("feedback.open")).toBeTruthy();
    expect(queryByText("common.retry")).toBeNull();
  });
});

/**
 * Le déroulé lancé depuis une carte. Ce que l'écran décide ici, et qui n'appartient à personne
 * d'autre : quelle TAILLE de chrono monter. Le décompte lui-même, ses tops et ses tours sont
 * éprouvés chez `useSegmentRunner`, `TimerOverlay` et `RunnerBody`.
 */
describe("SessionDetailScreen — le chrono", () => {
  beforeEach(() => {
    loaded({ exercises: [exercise("ex-1", "Tractions")] });
  });

  it("ne monte aucun chrono tant que rien n'est lancé", async () => {
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    await findByText("Tractions");

    expect(queryByText("plan.timer.stop")).toBeNull();
    expect(queryByText("plan.timer.skip")).toBeNull();
  });

  /**
   * Plusieurs segments s'enchaînent : l'athlète est à l'effort, pas en train de relire la consigne
   * suivante. On ouvre en GRAND d'office — un bandeau ne montrerait pas le geste à faire.
   */
  it("ouvre le grand chrono sur un enchaînement", async () => {
    const { findByText } = renderRn(<SessionDetailScreen />);
    press(await findByText("lancer un enchaînement ex-1"));

    expect(await findByText("plan.timer.stop")).toBeTruthy();
  });

  // Un repos seul se lit d'un coup d'œil : le bandeau suffit, et il laisse le déroulé visible.
  it("réduit au bandeau un repos qui ne s'enchaîne pas", async () => {
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    press(await findByText("lancer un repos seul ex-1"));

    expect(await findByText("plan.timer.skip")).toBeTruthy();
    expect(queryByText("plan.timer.stop")).toBeNull();
  });

  it("agrandit le bandeau, puis le réduit", async () => {
    const { container, findByText, getByLabelText, queryByText } = renderRn(
      <SessionDetailScreen />,
    );
    press(await findByText("lancer un repos seul ex-1"));

    press(getByLabelText("plan.timer.expand"));
    expect(await findByText("plan.timer.stop")).toBeTruthy();

    press(getByLabelText("plan.timer.reduce"));
    await waitFor(() => expect(queryByText("plan.timer.stop")).toBeNull());
    expect(container.textContent).toContain("plan.timer.skip");
  });

  /** « + 30 s » rallonge le segment EN COURS, dans le bandeau comme dans le grand chrono. */
  it.each([
    ["le bandeau", "lancer un repos seul ex-1", "1'", "1'30"],
    ["le grand chrono", "lancer un enchaînement ex-1", "30 s", "1'"],
  ])("rallonge le segment depuis %s", async (_, trigger, before, after) => {
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    press(await findByText(trigger));
    await findByText(before);

    pressButton(container, "plan.timer.add");

    expect(await findByText(after)).toBeTruthy();
  });

  // L'amorçage « Coche au fur et à mesure » disparaît au premier geste, définitivement.
  it("ferme l'amorçage au premier déroulé lancé", async () => {
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    await findByText("plan.tracking.hint");

    press(await findByText("lancer un repos seul ex-1"));

    expect(queryByText("plan.tracking.hint")).toBeNull();
  });
});

/**
 * Le déroulé et le suivi, les VRAIS, ensemble (#306).
 *
 * Écran éteint, le JS est gelé : aucun tic ne tombe. Au réveil, le premier tic voit d'un coup
 * plusieurs segments écoulés et les coche tous dans la même boucle, sans rendu entre deux. C'est
 * ce saut qui est rejoué ici — l'horloge avance d'un bloc, puis UN tic tombe. Avancer tic par tic
 * rendrait entre chaque segment, et ne rejouerait pas la veille.
 *
 * On lit ce qui est PERSISTÉ : c'est le disque que le débrief relit et envoie au coach.
 */
describe("SessionDetailScreen — rattrapage d'un déroulé passé écran éteint", () => {
  const effort = {
    id: "col_effort",
    source: MetricSource.CATALOG,
    key: MetricKey.EFFORT_DURATION,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  } as const;

  /** Gainage 3 × 30 s, repos 30 s : effort, repos, effort, repos, effort — 2 min 30 en tout. */
  const gainage: ExerciseBlock = {
    id: "b-gainage",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: 30 },
    metrics: [effort],
    rows: [{ id: "r-1", values: { [effort.id]: 30 } }],
  };

  const stored = () => JSON.parse(storedItems.get(`cimavia-tracking:${SESSION_ID}`) ?? "null");

  /** L'app dort `ms`, puis se réveille : un seul tic du déroulé tombe. */
  const sleep = (ms: number) =>
    act(() => {
      vi.setSystemTime(Date.now() + ms);
      vi.advanceTimersByTime(250);
    });

  beforeEach(() => {
    loaded({ exercises: [{ ...exercise("ex-1", "Gainage"), blocks: [gainage] }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * L'écran est rendu en temps RÉEL, et le faux n'est posé qu'au lancement : les `findBy*`
   * attendent sur de vrais minuteurs, qu'un temps faux figerait.
   */
  const launch = async () => {
    const { findByText } = renderRn(<SessionDetailScreen />);
    const trigger = await findByText("dérouler b-gainage");
    vi.useFakeTimers();
    press(trigger);
  };

  it("coche les trois séries quand l'écran s'est rallumé après la fin", async () => {
    await launch();
    sleep(160_000);
    expect(stored()).toEqual({ "ex-1": { "b-gainage": { checked: [0, 1, 2] } } });
  });

  it("coche les séries finies, pas celle qui reste, sur un réveil en cours de route", async () => {
    await launch();
    // 1 min 40 : deux efforts et un repos passés, on est dans le second repos.
    sleep(100_000);
    expect(stored()).toEqual({ "ex-1": { "b-gainage": { checked: [0, 1] } } });
  });
});

/**
 * Les gestes qui COCHENT, d'où qu'ils viennent : le grand chrono (« Top fait », « Tour fait ») ou la
 * carte. Ce qui s'affirme est ce qui est persisté — le disque que le débrief relit.
 */
describe("SessionDetailScreen — les gestes de suivi", () => {
  const reps = {
    id: "col_reps",
    source: MetricSource.CATALOG,
    key: MetricKey.REPETITIONS,
    unit: MetricUnit.REPS,
    label: null,
    collapsed: false,
  } as const;
  const rows = [{ id: "r-1", values: { [reps.id]: 6 } }];

  const emom: ExerciseBlock = {
    id: "b-emom",
    label: null,
    structure: { type: BlockType.EMOM, totalDurationSeconds: 180, intervalSeconds: 60 },
    metrics: [reps],
    rows,
  };
  const amrap: ExerciseBlock = {
    id: "b-amrap",
    label: null,
    structure: { type: BlockType.AMRAP, totalDurationSeconds: 600, targetRounds: null },
    metrics: [reps],
    rows,
  };

  const stored = () => JSON.parse(storedItems.get(`cimavia-tracking:${SESSION_ID}`) ?? "null");

  beforeEach(() => {
    loaded({ exercises: [{ ...exercise("ex-1", "Tractions"), blocks: [emom, amrap] }] });
  });

  it("coche le top validé depuis le grand chrono", async () => {
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    press(await findByText("dérouler b-emom"));
    await findByText("plan.timer.topDone");

    pressButton(container, "plan.timer.topDone");

    await waitFor(() => expect(stored()).toEqual({ "ex-1": { "b-emom": { checked: [0] } } }));
  });

  it("compte le tour validé depuis le grand chrono", async () => {
    const { container, findByText } = renderRn(<SessionDetailScreen />);
    press(await findByText("dérouler b-amrap"));
    await findByText("plan.timer.roundDone");

    pressButton(container, "plan.timer.roundDone");

    await waitFor(() => expect(stored()).toEqual({ "ex-1": { "b-amrap": { rounds: 1 } } }));
  });

  it.each([
    ["coche l'unité tapée sur la carte", "cocher b-emom", { "b-emom": { checked: [0] } }],
    ["compte les tours saisis sur la carte", "compter b-amrap", { "b-amrap": { rounds: 2 } }],
  ])("%s, et ferme l'amorçage", async (_, gesture, expected) => {
    const { findByText, queryByText } = renderRn(<SessionDetailScreen />);
    await findByText("plan.tracking.hint");

    press(await findByText(gesture));

    await waitFor(() => expect(stored()).toEqual({ "ex-1": expected }));
    expect(queryByText("plan.tracking.hint")).toBeNull();
  });
});

/**
 * Les notifications de TOUT le déroulé restant, posées d'avance (#253) : téléphone rangé, le JS est
 * gelé et plus rien ne serait programmé après la première. Ce qui s'affirme est ce qui part vers
 * l'OS — dans combien de secondes, et pour annoncer quoi. Chacune dit ce qui COMMENCE : c'est ce
 * que l'athlète doit faire en sortant le téléphone de sa poche.
 *
 * `cimode` perd l'interpolation : « nextBody » ne dit pas ici QUEL segment commence, seulement
 * qu'un segment commence. Le nom et la durée annoncés relèvent de la traduction.
 */
describe("SessionDetailScreen — les notifications programmées", () => {
  const schedule = vi.mocked(Notifications.scheduleNotificationAsync);

  const segment = (kind: string, seconds: number): BlockSegment =>
    ({ kind, seconds, unitIndex: null, rowId: null }) as unknown as BlockSegment;

  /** Ce qui est parti vers l'OS : [délai en secondes, texte], dans l'ordre de programmation. */
  const scheduled = () =>
    schedule.mock.calls.map(([request]) => [
      (request.trigger as { seconds: number }).seconds,
      request.content.body,
    ]);

  async function run(segments: BlockSegment[]) {
    scripted.segments = segments;
    const view = renderRn(<SessionDetailScreen />);
    press(await view.findByText("lancer le déroulé scripté ex-1"));
    return view;
  }

  beforeEach(() => {
    loaded({ exercises: [exercise("ex-1", "Tractions")] });
  });

  it("annonce chaque segment qui commence, puis la fin, à ses échéances cumulées", async () => {
    await run([segment("EFFORT", 30), segment("REST", 60), segment("EFFORT", 30)]);

    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(3));
    expect(scheduled()).toEqual([
      [30, "plan.timer.nextBody"],
      [90, "plan.timer.nextBody"],
      [120, "plan.timer.lastBody"],
    ]);
    expect(schedule.mock.calls.every(([request]) => request.content.title === "Tractions")).toBe(
      true,
    );
  });

  /**
   * Après un segment MANUEL, plus aucune échéance n'est connue : c'est l'athlète qui décide quand
   * le déroulé repart. On annonce qu'il est attendu, et rien au-delà.
   */
  it("s'arrête au premier segment manuel, en annonçant qu'il attend l'athlète", async () => {
    await run([segment("EFFORT", 30), segment("MANUAL", 0), segment("REST", 60)]);

    await waitFor(() => expect(schedule).toHaveBeenCalled());
    expect(scheduled()).toEqual([[30, "plan.timer.awaiting"]]);
  });

  it("ne programme rien quand le déroulé commence par un segment manuel", async () => {
    const { findByText } = await run([segment("MANUAL", 0), segment("REST", 60)]);
    await findByText("plan.timer.stop");

    expect(schedule).not.toHaveBeenCalled();
  });

  /**
   * Plafonnées à douze : iOS ne garde que 64 notifications programmées par app, et un EMOM de
   * 30 min les prendrait toutes. Le reste se programme quand le déroulé avance.
   */
  it("n'en programme jamais plus de douze d'un coup", async () => {
    const emom = Array.from({ length: 30 }, (_, index) =>
      segment(index % 2 === 0 ? "EFFORT" : "REST", 30),
    );

    await run(emom);

    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(12));
    expect(scheduled().at(-1)).toEqual([360, "plan.timer.nextBody"]);
  });

  it("annule ce qui était programmé quand l'athlète arrête le déroulé", async () => {
    const { container, findByText } = await run([segment("EFFORT", 30), segment("REST", 60)]);
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
    await findByText("plan.timer.stop");

    pressButton(container, "plan.timer.stop");

    await waitFor(() =>
      expect(vi.mocked(Notifications.cancelScheduledNotificationAsync)).toHaveBeenCalledTimes(2),
    );
  });
});

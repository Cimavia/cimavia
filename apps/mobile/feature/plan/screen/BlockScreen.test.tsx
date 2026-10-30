import { MetricKey, MetricUnit, type ScheduledSessionDto, STRUCTURE_PRESETS } from "@cmv/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { BlockScreen } from "@/feature/plan/screen/BlockScreen";
import { block, blockSession, REPS } from "@/test/block-session";
import { press, renderRn } from "@/test/render";
import { storedItems } from "@/test/setup";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: vi.fn() }));
// La consigne et les documents ont leur test (`ExerciseCard`) : hors sujet pour l'écran.
vi.mock("@/feature/plan/component/ExerciseExtras", () => ({ ExerciseExtras: () => null }));

function query(state: Partial<UseQueryResult<ScheduledSessionDto>>) {
  vi.mocked(useScheduledSession).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as UseQueryResult<ScheduledSessionDto>);
}

const open = (blockId: string) =>
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: "s-1", blockId });

const stored = () => JSON.parse(storedItems.get("cimavia-block-tracking:s-1") ?? "null");

beforeEach(() => {
  query({ data: blockSession() });
  open("blk-1");
});

describe("BlockScreen — lecture et suivi", () => {
  it("lit le bloc, « Un tour » et « Mon suivi »", () => {
    renderRn(<BlockScreen />);

    expect(screen.getByText("Force & conditionnement")).toBeTruthy();
    expect(screen.getByText("plan.blocks.tracking")).toBeTruthy();
    expect(screen.getByText("plan.blocks.runTimer")).toBeTruthy();
  });

  it("dit « Un tour » d'un bloc à plusieurs exercices", () => {
    open("blk-3");
    renderRn(<BlockScreen />);

    expect(screen.getByText("plan.blocks.oneRound")).toBeTruthy();
  });

  it("dit que le bloc a disparu quand le coach l'a retiré", () => {
    open("blk-absent");
    renderRn(<BlockScreen />);

    expect(screen.getByText("plan.blocks.missing")).toBeTruthy();
    expect(screen.queryByText("plan.blocks.runTimer")).toBeNull();
  });

  it("attend la séance, sans rien annoncer", () => {
    query({ isPending: true });
    renderRn(<BlockScreen />);

    expect(screen.queryByText("plan.blocks.missing")).toBeNull();
  });

  it("propose de réessayer quand la séance n'a pas pu être lue", () => {
    const refetch = vi.fn();
    query({ isError: true, refetch: refetch as UseQueryResult<ScheduledSessionDto>["refetch"] });
    renderRn(<BlockScreen />);

    press(screen.getByText("common.retry"));

    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("plan.blocks.missing")).toBeNull();
  });

  it("persiste une coche sous la séance, bloc par bloc", () => {
    renderRn(<BlockScreen />);

    press(screen.getAllByRole("checkbox")[0] as HTMLElement);

    expect(stored()["blk-1"]).toEqual({ checked: [{ key: "a1", row: 0 }] });
  });

  it("revient en arrière", () => {
    renderRn(<BlockScreen />);

    press(screen.getByLabelText("plan.blocks.back"));

    expect(router.back).toHaveBeenCalled();
  });
});

/**
 * Le chrono : rendu en temps RÉEL, le faux n'est posé qu'au lancement, comme pour le chrono d'un
 * exercice (`SessionDetailScreen.test`).
 */
describe("BlockScreen — le chrono", () => {
  const tick = (ms: number) =>
    act(() => {
      vi.setSystemTime(Date.now() + ms);
      vi.advanceTimersByTime(250);
    });

  const launch = () => {
    renderRn(<BlockScreen />);
    vi.useFakeTimers();
    press(screen.getByText("plan.blocks.runTimer"));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("attend « J'ai fini » sur des séries, puis enchaîne le repos", () => {
    launch();

    expect(screen.getByText("plan.clock.title.DO")).toBeTruthy();
    expect(screen.queryByText("plan.blocks.runTimer")).toBeNull();

    press(screen.getByText("plan.clock.done"));

    expect(screen.getByText("plan.clock.title.REST")).toBeTruthy();
    expect(screen.getByText("plan.clock.next")).toBeTruthy();
  });

  it("ne coche rien : le suivi reste au geste de l'athlète", () => {
    launch();
    press(screen.getByText("plan.clock.done"));
    tick(200_000);

    expect(stored()).toBeNull();
  });

  it("passe une étape, puis s'arrête et rend le bouton de lancement", () => {
    launch();

    press(screen.getByText("plan.timer.skip"));
    expect(screen.getByText("plan.clock.title.REST")).toBeTruthy();

    press(screen.getByText("plan.timer.stop"));
    expect(screen.queryByText("plan.clock.title.REST")).toBeNull();
    expect(screen.getByText("plan.blocks.runTimer")).toBeTruthy();
  });

  it("met en pause un repos, le reprend, et l'allonge de 30 s", () => {
    launch();
    press(screen.getByText("plan.clock.done"));

    press(screen.getByText("plan.timer.pause"));
    press(screen.getByText("plan.timer.resume"));
    press(screen.getByText("plan.timer.add"));

    expect(screen.getByText("plan.clock.title.REST")).toBeTruthy();
  });

  it("se lance sur le repos que porte la grille, même sans repos dans la structure", () => {
    const rest = {
      ...REPS,
      id: "col_rest",
      key: MetricKey.REST_BETWEEN_ROUNDS,
      unit: MetricUnit.NONE,
    };
    const grid = {
      metrics: [REPS, rest],
      rows: [{ id: "row_0", values: { [REPS.id]: 8, [rest.id]: 30 } }],
    };
    const settings = { ...STRUCTURE_PRESETS.SERIES, restBetweenRoundsSeconds: null };
    query({
      data: blockSession({
        blocks: [block({ id: "blk-1", settings, exercises: [["sx-1", "a1", grid]] })],
      }),
    });
    launch();

    // Des tractions : « J'ai fini », puis les 30 s de la colonne.
    press(screen.getByText("plan.clock.done"));
    expect(screen.getByText("plan.clock.title.REST")).toBeTruthy();
  });

  it("joue un AMRAP comme un compte à rebours, sur un tour entier", () => {
    open("blk-2");
    launch();

    expect(screen.getByText("plan.clock.title.CAP")).toBeTruthy();
    expect(screen.getAllByText("plan.blocks.oneRound").length).toBeGreaterThan(0);
  });

  it("enchaîne effort et repos d'un Tabata, au fil du temps", () => {
    open("blk-3");
    launch();

    expect(screen.getByText("plan.clock.title.EFFORT")).toBeTruthy();
    tick(20_000);
    expect(screen.getByText("plan.clock.title.REST")).toBeTruthy();
  });

  it("annonce les étapes à venir par notification", async () => {
    open("blk-3");
    launch();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(vi.mocked(Notifications.scheduleNotificationAsync)).toHaveBeenCalled();
  });
});

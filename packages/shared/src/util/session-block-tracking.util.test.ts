import { describe, expect, it } from "vitest";
import { presets, rounds, settingsOf } from "../../test/block-fixtures";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import { BlockTallyState } from "./block-tracking.util";
import {
  blockTrackingOf,
  blockTrackingOfSession,
  feedbackTrackingInput,
  isBlockTrackingSent,
  sameBlockTracking,
  sessionBlockTally,
  toggleBlockCheck,
  trackedBlockTally,
  withSentBlockTracking,
} from "./session-block-tracking.util";

const series = {
  id: "blk_1",
  settings: settingsOf({ repeat: rounds(2) }),
  exercises: [{ key: "a1" }],
};
const amrap = { id: "blk_2", settings: presets.AMRAP, exercises: [{ key: "b1" }, { key: "b2" }] };

describe("blockTrackingOf", () => {
  it("part du suivi que porte chaque bloc, NON SUIVI compris", () => {
    expect(
      blockTrackingOf([
        { id: "blk_1", tracking: { checked: [{ row: 0, key: "a1" }] } },
        { id: "blk_2", tracking: null },
      ]),
    ).toEqual({ blk_1: { checked: [{ row: 0, key: "a1" }] }, blk_2: null });
  });
});

describe("toggleBlockCheck", () => {
  it("fait naître le suivi du bloc, puis le rend NON SUIVI à la dernière case décochée", () => {
    const checked = toggleBlockCheck({ blk_1: null }, "blk_1", { row: 1, key: "a1" });
    expect(checked).toEqual({ blk_1: { checked: [{ row: 1, key: "a1" }] } });
    expect(toggleBlockCheck(checked, "blk_1", { row: 1, key: "a1" })).toEqual({ blk_1: null });
  });

  it("décoche une case parmi d'autres sans toucher aux restantes", () => {
    const two = {
      blk_1: {
        checked: [
          { row: 0, key: "a1" },
          { row: 1, key: "a1" },
        ],
      },
    };
    expect(toggleBlockCheck(two, "blk_1", { row: 0, key: "a1" })).toEqual({
      blk_1: { checked: [{ row: 1, key: "a1" }] },
    });
  });

  it("coche « Bloc fait » sans exercice, à côté des autres blocs", () => {
    expect(toggleBlockCheck({ blk_1: null }, "blk_2", { row: 0, key: null })).toEqual({
      blk_1: null,
      blk_2: { checked: [{ row: 0, key: null }] },
    });
  });
});

describe("blockTrackingOfSession", () => {
  it("rend le suivi lui-même quand tout désigne encore une case", () => {
    const tracking = { blk_1: { checked: [{ row: 1, key: "a1" }] }, blk_2: null };
    expect(blockTrackingOfSession(tracking, [series, amrap])).toBe(tracking);
  });

  it("retire un bloc que la séance n'a plus, et une case que son bloc n'a plus", () => {
    const tracking = {
      blk_1: {
        checked: [
          { row: 0, key: "a1" },
          { row: 5, key: "a1" },
          { row: 0, key: "zz" },
        ],
      },
      blk_old: { checked: [] },
    };
    expect(blockTrackingOfSession(tracking, [series])).toEqual({
      blk_1: { checked: [{ row: 0, key: "a1" }] },
    });
  });
});

describe("isBlockTrackingSent", () => {
  it("compare après le même filtre que l'envoi", () => {
    const sent = { blk_1: { checked: [{ row: 0, key: "a1" }] } };
    const local = { ...sent, blk_old: { checked: [] } };
    expect(isBlockTrackingSent(local, sent, [series])).toBe(true);
    expect(
      isBlockTrackingSent(toggleBlockCheck(local, "blk_1", { row: 1, key: "a1" }), sent, [series]),
    ).toBe(false);
  });
});

describe("sameBlockTracking", () => {
  const ticked = { blk_1: { checked: [{ row: 0, key: "a1" }] } };

  it("ne voit pas de modification dans un bloc ajouté ou retiré par le Coach", () => {
    // Le local date d'avant l'ajout de blk_2, et cite encore blk_old que la séance n'a plus.
    const local = { ...ticked, blk_old: { checked: [] } };
    expect(sameBlockTracking(local, { ...ticked, blk_2: null }, [series, amrap])).toBe(true);
  });

  it("voit une coche que le distant n'a pas", () => {
    expect(sameBlockTracking(ticked, { blk_1: null }, [series])).toBe(false);
  });
});

describe("withSentBlockTracking", () => {
  it("écrit l'envoi dans la séance en cache ; un bloc absent garde son suivi", () => {
    const session = {
      blocks: [
        { id: "blk_1", tracking: null },
        { id: "blk_2", tracking: { checked: [] } },
      ],
    } as unknown as ScheduledSessionDto;
    const next = withSentBlockTracking(session, { blk_1: { checked: [{ row: 0, key: "a1" }] } });
    expect(next.blocks.map((block) => block.tracking)).toEqual([
      { checked: [{ row: 0, key: "a1" }] },
      { checked: [] },
    ]);
    expect(withSentBlockTracking(session, { blk_2: null }).blocks[1]?.tracking).toBeNull();
  });
});

describe("sessionBlockTally", () => {
  it("lit le bloc dans le suivi de la séance, et ne dit rien d'un bloc absent ou vide", () => {
    expect(sessionBlockTally(series, {})).toBeNull();
    expect(sessionBlockTally(series, { blk_1: { checked: [] } })).toBeNull();
    expect(
      sessionBlockTally(series, {
        blk_1: {
          checked: [
            { row: 0, key: "a1" },
            { row: 1, key: "a1" },
          ],
        },
      })?.state,
    ).toBe("DONE");
  });
});

describe("trackedBlockTally", () => {
  const tracked = {
    blockId: "blk_1",
    label: null,
    name: "Séries",
    settings: series.settings,
    exerciseKeys: ["a1"],
    tracking: null,
  };

  it("ne dit rien d'un bloc où rien n'est coché", () => {
    expect(trackedBlockTally(tracked)).toBeNull();
  });

  it("décompte les cases du bloc d'après les clés de ses exercices", () => {
    const partial = { ...tracked, tracking: { checked: [{ row: 0, key: "a1" }] } };
    const done = {
      ...tracked,
      tracking: {
        checked: [
          { row: 0, key: "a1" },
          { row: 1, key: "a1" },
        ],
      },
    };

    expect(trackedBlockTally(partial)?.state).toBe(BlockTallyState.PARTIAL);
    expect(trackedBlockTally(done)?.state).toBe(BlockTallyState.DONE);
  });
});

describe("feedbackTrackingInput", () => {
  const exercises = [{ id: "ex_1", blocks: [{ id: "b_1" }] }];
  const exerciseTracking = { ex_1: { b_1: { checked: [0] } }, ex_gone: { b_1: { checked: [0] } } };
  const blockTracking = {
    blk_1: { checked: [{ row: 0, key: "a1" }] },
    blk_gone: { checked: [{ row: 0, key: "z1" }] },
  };

  it("envoie le suivi par bloc seul d'une séance par blocs, sans les blocs retirés", () => {
    const session = { exercises, blocks: [series] } as never;

    expect(feedbackTrackingInput(session, exerciseTracking, blockTracking)).toEqual({
      blockTracking: { blk_1: { checked: [{ row: 0, key: "a1" }] } },
    });
  });

  it("envoie le suivi par exercice seul d'une séance sans bloc, sans les exercices retirés", () => {
    const session = { exercises, blocks: [] } as never;

    expect(feedbackTrackingInput(session, exerciseTracking, blockTracking)).toEqual({
      tracking: { ex_1: { b_1: { checked: [0] } } },
    });
  });
});

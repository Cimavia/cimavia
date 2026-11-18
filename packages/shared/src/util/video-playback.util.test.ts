import { describe, expect, it } from "vitest";
import {
  openVideoPlayback,
  SLOW_VIDEO_STARTUP_MS,
  trackVideoPlayback,
  VIDEO_STALL_MIN_MS,
  type VideoPlaybackEvent,
  type VideoPlaybackTimeline,
  videoBitrateMbps,
  videoPlaybackReport,
} from "./video-playback.util";

// Une vidéo de 30 s à 64 Mbit/s : un original de caméra Pixel, tel que mesuré en #809.
const SIZE = 240_000_000;
const DURATION = 30;

function replay(events: VideoPlaybackEvent[], openedAtMs = 0): VideoPlaybackTimeline {
  return events.reduce(trackVideoPlayback, openVideoPlayback(openedAtMs));
}

describe("trackVideoPlayback", () => {
  it("date la première image, et seulement la première", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 1200 },
      { type: "firstFrame", atMs: 9000 },
    ]);
    expect(timeline.firstFrameAtMs).toBe(1200);
  });

  it("ne compte pas l'attente du démarrage comme une recharge", () => {
    const timeline = replay([
      { type: "loading", atMs: 100 },
      { type: "ready", atMs: 800 },
      { type: "firstFrame", atMs: 900 },
    ]);
    expect(timeline.stalls).toEqual([]);
  });

  it("ouvre une recharge sur une attente après la première image, la ferme à la reprise", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 1000 },
      { type: "loading", atMs: 5000 },
      { type: "ready", atMs: 7000 },
    ]);
    expect(timeline.stalls).toEqual([{ startMs: 5000, endMs: 7000 }]);
  });

  // Une nouvelle « première image » arrive sur un changement de piste : elle ne ferme rien.
  it("ne ferme pas une recharge sur une image de changement de piste", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 1000 },
      { type: "loading", atMs: 5000 },
      { type: "firstFrame", atMs: 6500 },
    ]);
    expect(timeline.stalls).toEqual([{ startMs: 5000, endMs: null }]);
  });

  it("ne double pas une recharge déjà en cours", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 1000 },
      { type: "loading", atMs: 5000 },
      { type: "loading", atMs: 5500 },
    ]);
    expect(timeline.stalls).toEqual([{ startMs: 5000, endMs: null }]);
  });

  it("ignore un « prêt » sans attente en cours", () => {
    const before = replay([{ type: "firstFrame", atMs: 1000 }]);
    expect(trackVideoPlayback(before, { type: "ready", atMs: 2000 })).toBe(before);
  });

  it("ne modifie pas le relevé qu'on lui passe", () => {
    const before = replay([{ type: "firstFrame", atMs: 1000 }]);
    trackVideoPlayback(before, { type: "loading", atMs: 2000 });
    expect(before.stalls).toEqual([]);
  });
});

describe("videoBitrateMbps", () => {
  it("rend le débit moyen en Mbit/s, au dixième", () => {
    expect(videoBitrateMbps(SIZE, DURATION)).toBe(64);
    expect(videoBitrateMbps(6_100_000, 3)).toBe(16.3);
  });

  it.each([
    ["taille inconnue", null, DURATION],
    ["durée inconnue", SIZE, null],
    ["durée nulle", SIZE, 0],
  ])("ne devine pas : %s → null", (_, size, duration) => {
    expect(videoBitrateMbps(size, duration)).toBeNull();
  });
});

describe("videoPlaybackReport", () => {
  // Un curseur déplacé à la main fait attendre un instant, même en wifi : ce n'est pas un arrêt.
  it("ne compte pas une attente plus courte que le seuil", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 500 },
      { type: "loading", atMs: 4000 },
      { type: "ready", atMs: 4000 + VIDEO_STALL_MIN_MS - 1 },
    ]);
    expect(videoPlaybackReport(timeline, 60_000, SIZE, DURATION)).toBeNull();
  });

  it("ne remonte rien d'une lecture fluide", () => {
    const timeline = replay([{ type: "firstFrame", atMs: SLOW_VIDEO_STARTUP_MS }]);
    expect(videoPlaybackReport(timeline, 60_000, SIZE, DURATION)).toBeNull();
  });

  it("remonte un démarrage au-delà du seuil, avec le débit de la vidéo", () => {
    const timeline = replay([{ type: "firstFrame", atMs: 8000 }], 1000);
    expect(videoPlaybackReport(timeline, 60_000, SIZE, DURATION)).toEqual({
      startupMs: 7000,
      started: true,
      stallCount: 0,
      stallMs: 0,
      bitrateMbps: 64,
    });
  });

  it("remonte une lecture rapide à démarrer mais qui recharge, sans ses attentes brèves", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 500 },
      { type: "loading", atMs: 4000 },
      { type: "ready", atMs: 6000 },
      { type: "loading", atMs: 9000 },
      { type: "ready", atMs: 9500 },
      { type: "loading", atMs: 12_000 },
      { type: "ready", atMs: 13_500 },
    ]);
    expect(videoPlaybackReport(timeline, 20_000, SIZE, DURATION)).toMatchObject({
      startupMs: 500,
      stallCount: 2,
      stallMs: 3500,
    });
  });

  it("compte jusqu'à la fermeture une recharge encore en cours", () => {
    const timeline = replay([
      { type: "firstFrame", atMs: 500 },
      { type: "loading", atMs: 4000 },
    ]);
    expect(videoPlaybackReport(timeline, 10_000, SIZE, DURATION)?.stallMs).toBe(6000);
  });

  it("remonte une vidéo fermée avant sa première image, attente comprise", () => {
    const timeline = openVideoPlayback(0);
    expect(videoPlaybackReport(timeline, 12_000, SIZE, null)).toEqual({
      startupMs: 12_000,
      started: false,
      stallCount: 0,
      stallMs: 0,
      bitrateMbps: null,
    });
  });

  it("tait une vidéo refermée aussitôt, sans image : l'utilisateur a changé d'avis", () => {
    expect(videoPlaybackReport(openVideoPlayback(0), 1500, SIZE, DURATION)).toBeNull();
  });
});

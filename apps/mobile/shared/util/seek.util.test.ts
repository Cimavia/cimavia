import { describe, expect, it } from "vitest";
import { nudge, positionAt, SEEK_STEP_SECONDS } from "./seek.util";

describe("positionAt", () => {
  it("rend la part de la note qui correspond au point touché", () => {
    expect(positionAt(100, 200, 90)).toBe(45);
    expect(positionAt(0, 200, 90)).toBe(0);
    expect(positionAt(200, 200, 90)).toBe(90);
  });

  // Le doigt continue sa course hors de la barre : la note, elle, s'arrête à ses bords.
  it("borne la position à la note quand le doigt sort de la barre", () => {
    expect(positionAt(-30, 200, 90)).toBe(0);
    expect(positionAt(260, 200, 90)).toBe(90);
  });

  /** Rien à viser n'est pas « le début » : un 0 ferait sauter la note là où personne n'a visé. */
  it("ne vise rien sans largeur ni durée", () => {
    expect(positionAt(100, 0, 90)).toBeNull();
    expect(positionAt(100, 200, null)).toBeNull();
    expect(positionAt(100, 200, 0)).toBeNull();
  });
});

describe("nudge", () => {
  it("avance et recule d'un pas", () => {
    expect(nudge(45, 1, 90)).toBe(45 + SEEK_STEP_SECONDS);
    expect(nudge(45, -1, 90)).toBe(45 - SEEK_STEP_SECONDS);
  });

  it("ne sort pas de la note", () => {
    expect(nudge(88, 1, 90)).toBe(90);
    expect(nudge(2, -1, 90)).toBe(0);
  });
});

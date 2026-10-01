import { describe, expect, it } from "vitest";
import { athleteLabel, isSelfAthlete } from "./athlete-label.util";

/** Le libellé traduit est remplacé par sa clé et son paramètre, pour voir lequel est choisi. */
const translate = (key: string, values: { name: string }) => `${key}(${values.name})`;

describe("isSelfAthlete", () => {
  it("reconnaît le compte courant", () => {
    expect(isSelfAthlete("me", "me")).toBe(true);
  });

  it("ne confond pas un autre athlète avec soi", () => {
    expect(isSelfAthlete("me", "a-1")).toBe(false);
  });

  /** Session non résolue : on ne prétend pas que c'est soi. */
  it.each([null, undefined])("ne reconnaît personne sans session (%s)", (selfId) => {
    expect(isSelfAthlete(selfId, "me")).toBe(false);
  });
});

describe("athleteLabel", () => {
  it("marque le compte courant quand il se coache lui-même (#14)", () => {
    expect(athleteLabel("me", "Dual Curl", "me", translate)).toBe("athlete.self(Dual Curl)");
  });

  it("rend le nom brut d'un autre athlète", () => {
    expect(athleteLabel("a-1", "Léa Moreau", "me", translate)).toBe("Léa Moreau");
  });

  it("ne marque personne tant que la session n'est pas connue", () => {
    expect(athleteLabel("me", "Dual Curl", null, translate)).toBe("Dual Curl");
  });
});

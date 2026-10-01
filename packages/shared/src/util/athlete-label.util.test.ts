import { describe, expect, it } from "vitest";
import { athleteLabel, createAthleteLabelHooks, isSelfAthlete } from "./athlete-label.util";

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

describe("createAthleteLabelHooks", () => {
  /** Les « hooks » de l'app sont de simples fonctions : la session, puis la traduction. */
  const hooks = (selfId: string | undefined) =>
    createAthleteLabelHooks(
      () => selfId,
      () => translate,
    );

  it("nomme avec la session et la traduction que l'app lui donne", () => {
    const label = hooks("me").useAthleteLabel();

    expect(label("me", "Dual Curl")).toBe("athlete.self(Dual Curl)");
    expect(label("a-1", "Léa Moreau")).toBe("Léa Moreau");
  });

  it("décide si c'est soi avec la même session", () => {
    const isSelf = hooks("me").useIsSelfAthlete();

    expect(isSelf("me")).toBe(true);
    expect(isSelf("a-1")).toBe(false);
  });

  it("ne reconnaît personne tant que la session n'est pas résolue", () => {
    expect(hooks(undefined).useIsSelfAthlete()("me")).toBe(false);
    expect(hooks(undefined).useAthleteLabel()("me", "Dual Curl")).toBe("Dual Curl");
  });
});

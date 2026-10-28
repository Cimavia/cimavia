import { describe, expect, it } from "vitest";
import {
  asMuchAsPossible,
  beep,
  cycle,
  once,
  oneByBeep,
  presets,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import { say } from "../../test/french";
import { StructureOrder } from "../dto/structure-answer.schema";
import {
  disabledOptions,
  everyPhrase,
  exerciseOrderShown,
  gridRowLimit,
  isCustomized,
  oneAtATime,
  roundsError,
  SettingOption,
  settingsIssues,
  settingsPhrase,
  settingsShape,
  settingValues,
  structureDuration,
} from "./structure-settings.util";

/** Les réponses grisées et leur raison, lisibles. */
function disabledOf(
  settings: Parameters<typeof disabledOptions>[0],
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(disabledOptions(settings)).map(([option, reason]) => [
      option,
      say(reason ?? null),
    ]),
  );
}

describe("disabledOptions", () => {
  it("ne grise rien quand l'athlète enchaîne à son rythme, pour un nombre de tours", () => {
    expect(disabledOptions(presets.SERIES)).toEqual({});
  });

  it("avec un bip : un nombre de tours, et le temps avant le bip sert de repos", () => {
    expect(disabledOf(presets.EMOM)).toEqual({
      [SettingOption.REPEAT_MAX]: "Avec un bip, indique un nombre de tours.",
      [SettingOption.REPEAT_ONCE]: "Avec un bip, indique un nombre de tours.",
      [SettingOption.REST_BETWEEN_EXERCISES]: "Le temps avant le bip sert déjà de repos.",
      [SettingOption.REST_BETWEEN_ROUNDS]: "Le temps avant le bip sert déjà de repos.",
      [SettingOption.LIMIT]: "Inutile : la durée se calcule seule (10 × 1' = 10').",
    });
  });

  it("avec effort et repos imposés : les repos sont déjà compris", () => {
    expect(disabledOf(presets.TABATA)).toEqual({
      [SettingOption.REPEAT_MAX]: "Avec effort et repos imposés, indique un nombre de tours.",
      [SettingOption.REPEAT_ONCE]: "Avec effort et repos imposés, indique un nombre de tours.",
      [SettingOption.REST_BETWEEN_EXERCISES]: "Déjà compris dans le repos imposé.",
      [SettingOption.REST_BETWEEN_ROUNDS]: "Déjà compris dans le repos imposé.",
      [SettingOption.LIMIT]: "Inutile : la durée se calcule seule (8 × 30 s = 4').",
    });
  });

  it("une seule fois : pas de repos entre tours, puisqu'il n'y a qu'un passage", () => {
    expect(disabledOf(presets.FREE)).toEqual({
      [SettingOption.REST_BETWEEN_ROUNDS]: "Un seul passage : choisis un nombre de tours.",
    });
  });

  it("AMRAP : le chrono tourne, et le bloc a déjà sa durée", () => {
    expect(disabledOf(presets.AMRAP)).toEqual({
      [SettingOption.REST_BETWEEN_ROUNDS]: "Le chrono tourne : l'athlète se repose sur son temps.",
      [SettingOption.LIMIT]: "Inutile : le bloc dure déjà 12'.",
    });
  });
});

describe("settingsIssues", () => {
  it("ne signale rien sur des réglages cohérents", () => {
    expect(settingsIssues(presets.FOR_TIME)).toEqual([]);
  });

  it("signale chaque réponse grisée qui porte une valeur, sous son champ", () => {
    const settings = settingsOf({
      advance: beep(60),
      repeat: asMuchAsPossible(600),
      restBetweenExercisesSeconds: 30,
    });
    expect(settingsIssues(settings).map((issue) => issue.path)).toEqual([
      "repeat",
      "restBetweenExercisesSeconds",
    ]);
  });
});

describe("l'ordre des exercices", () => {
  it("n'apparaît qu'à partir de deux exercices, avec un bip ou un cycle", () => {
    expect(exerciseOrderShown(presets.EMOM, 2)).toBe(true);
    expect(exerciseOrderShown(presets.TABATA, 2)).toBe(true);
    expect(exerciseOrderShown(presets.EMOM, 1)).toBe(false);
    expect(exerciseOrderShown(presets.SERIES, 3)).toBe(false);
  });

  it("« un seul par bip » ne vaut que là où l'ordre apparaît", () => {
    expect(oneAtATime(oneByBeep(60, 10), 2)).toBe(true);
    expect(oneAtATime(oneByBeep(60, 10), 1)).toBe(false);
    expect(oneAtATime(presets.EMOM, 2)).toBe(false);
  });

  it("« un seul par bip » exige au moins autant de bips que d'exercices", () => {
    expect(say(roundsError(oneByBeep(60, 2), 3))).toBe("Au moins 3 bips pour 3 exercices.");
    expect(roundsError(oneByBeep(60, 3), 3)).toBeNull();
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(2),
      order: StructureOrder.ONE,
    });
    expect(say(roundsError(intervals, 3))).toBe("Au moins 3 intervalles pour 3 exercices.");
  });

  it("ne réclame rien quand les exercices s'enchaînent tous à chaque bip", () => {
    expect(roundsError(settingsOf({ advance: beep(60), repeat: rounds(2) }), 3)).toBeNull();
    expect(
      roundsError(
        settingsOf({ advance: beep(60), repeat: asMuchAsPossible(60), order: StructureOrder.ONE }),
        3,
      ),
    ).toBeNull();
  });
});

describe("gridRowLimit", () => {
  it("donne une ligne par tour ou par série, une par passage avec un seul par bip", () => {
    expect(gridRowLimit(presets.SERIES, 2, 1)).toBe(4);
    expect(gridRowLimit(oneByBeep(60, 10), 2, 1)).toBe(5);
  });

  it("donne aux premiers un passage de plus quand le compte ne tombe pas juste", () => {
    expect([0, 1, 2].map((index) => gridRowLimit(oneByBeep(60, 10), 3, index))).toEqual([4, 3, 3]);
    expect([0, 1, 2].map((index) => gridRowLimit(oneByBeep(60, 8), 3, index))).toEqual([3, 3, 2]);
  });

  it("donne une seule ligne à un bloc fait une fois ou autant que possible", () => {
    expect(gridRowLimit(presets.FREE, 3, 0)).toBe(1);
    expect(gridRowLimit(presets.AMRAP, 3, 0)).toBe(1);
  });
});

describe("structureDuration", () => {
  it("se déduit d'un nombre de bips ou d'intervalles", () => {
    expect(structureDuration(presets.EMOM)).toEqual({
      totalSeconds: 600,
      rounds: 10,
      unitSeconds: 60,
    });
    expect(structureDuration(presets.TABATA)).toEqual({
      totalSeconds: 240,
      rounds: 8,
      unitSeconds: 30,
    });
  });

  it("est `null` quand personne ne la connaît", () => {
    expect(structureDuration(presets.SERIES)).toBeNull();
    expect(structureDuration(presets.AMRAP)).toBeNull();
  });

  it("est `null` sans nombre de tours, même sur un bip que le schéma refuserait", () => {
    const capped = settingsOf({ advance: beep(60), repeat: asMuchAsPossible(600) });
    expect(structureDuration(capped)).toBeNull();
  });
});

describe("réglage ou valeur", () => {
  it("changer une valeur ne rend pas le bloc personnalisé", () => {
    const adjusted = settingsOf({ repeat: rounds(5), restBetweenRoundsSeconds: 180 });
    expect(isCustomized(adjusted, presets.SERIES)).toBe(false);
  });

  it("changer un réglage le rend personnalisé", () => {
    const withRest = { ...presets.SERIES, restBetweenExercisesSeconds: 30 };
    expect(isCustomized(withRest, presets.SERIES)).toBe(true);
    expect(isCustomized(presets.EMOM, presets.SERIES)).toBe(true);
    expect(isCustomized(oneByBeep(60, 10), presets.EMOM)).toBe(true);
  });

  it("la forme des réglages tait leurs nombres", () => {
    expect(settingsShape(presets.FOR_TIME)).toEqual({
      advance: "ATHLETE",
      repeat: "ROUNDS",
      order: "ALL",
      restBetweenExercises: false,
      restBetweenRounds: false,
      limit: true,
    });
    expect(settingsShape({ ...presets.SERIES, restBetweenExercisesSeconds: 30 })).toMatchObject({
      restBetweenExercises: true,
      restBetweenRounds: true,
      limit: false,
    });
  });

  it("chaque valeur, `null` quand la réponse choisie n'en porte pas", () => {
    expect(settingValues(presets.EMOM)).toEqual({
      EVERY: 60,
      WORK: null,
      REST: null,
      ROUNDS: 10,
      CAP: null,
      REST_BETWEEN_EXERCISES: null,
      REST_BETWEEN_ROUNDS: null,
      LIMIT: null,
    });
    expect(settingValues(presets.TABATA)).toMatchObject({ WORK: 20, REST: 10, EVERY: null });
    expect(settingValues(presets.AMRAP)).toMatchObject({ CAP: 720, ROUNDS: null });
  });
});

describe("everyPhrase", () => {
  it("dit « chaque » pour une seconde, une minute ou une heure pile, sinon « toutes les »", () => {
    expect(say(everyPhrase(1))).toBe("chaque seconde");
    expect(say(everyPhrase(60))).toBe("chaque minute");
    expect(say(everyPhrase(3600))).toBe("chaque heure");
    expect(say(everyPhrase(240))).toBe("toutes les 4'");
    expect(say(everyPhrase(90))).toBe("toutes les 1'30");
  });
});

describe("settingsPhrase", () => {
  it("dit « séries » avec un exercice, « tours » à partir de deux ou pour une structure seule", () => {
    expect(say(settingsPhrase(presets.SERIES, 1))).toBe(
      "4 séries à son rythme, 2' de repos entre séries",
    );
    expect(say(settingsPhrase(presets.SERIES, 2))).toBe(
      "4 tours à son rythme, 2' de repos entre tours",
    );
    expect(say(settingsPhrase(presets.SERIES, null))).toBe(
      "4 tours à son rythme, 2' de repos entre tours",
    );
  });

  it("dit « tours » à un exercice seul que le bloc fait ailleurs à plusieurs", () => {
    expect(say(settingsPhrase(presets.SERIES, 1, [], false))).toBe(
      "4 tours à son rythme, 2' de repos entre tours",
    );
  });

  it("accorde au singulier : « 1 série »", () => {
    expect(say(settingsPhrase(settingsOf({ repeat: rounds(1) }), 1))).toBe("1 série à son rythme");
  });

  it("rend chaque structure prête", () => {
    expect(say(settingsPhrase(presets.EMOM, 2))).toBe("10 tours, un bip chaque minute");
    expect(say(settingsPhrase(presets.AMRAP, 3))).toBe("Le plus de tours possible en 12'");
    expect(say(settingsPhrase(presets.TABATA, 1))).toBe("8 séries : 20 s d'effort, 10 s de repos");
    expect(say(settingsPhrase(presets.FOR_TIME, 2))).toBe(
      "3 tours le plus vite possible, 15' au plus",
    );
    expect(say(settingsPhrase(presets.FREE, 1))).toBe("Une fois, à son rythme");
    expect(say(settingsPhrase(presets.FREE, 3))).toBe("Chaque exercice une fois, à son rythme");
  });

  it("dit « toutes les 4' » pour un bip qui n'est pas d'une minute", () => {
    expect(say(settingsPhrase(settingsOf({ advance: beep(240), repeat: rounds(6) }), 1))).toBe(
      "6 séries, un bip toutes les 4'",
    );
  });

  it("ajoute le repos entre exercices à partir de deux exercices", () => {
    const settings = settingsOf({ restBetweenExercisesSeconds: 30, restBetweenRoundsSeconds: 150 });
    expect(say(settingsPhrase(settings, 2))).toBe(
      "4 tours à son rythme, 30 s entre exercices, 2'30 de repos entre tours",
    );
    expect(say(settingsPhrase(settings, 1))).toBe(
      "4 séries à son rythme, 2'30 de repos entre séries",
    );
  });

  it("une seule fois, le plus vite possible quand une limite est posée", () => {
    expect(say(settingsPhrase(settingsOf({ repeat: once, limitSeconds: 600 }), 1))).toBe(
      "Une fois, le plus vite possible, 10' au plus",
    );
  });

  it("tait un réglage grisé même s'il porte une valeur", () => {
    const settings = settingsOf({
      advance: beep(60),
      restBetweenRoundsSeconds: 60,
      limitSeconds: 60,
    });
    expect(say(settingsPhrase(settings, 2))).toBe("4 tours, un bip chaque minute");
    const amrap = settingsOf({ repeat: asMuchAsPossible(600), restBetweenExercisesSeconds: 30 });
    expect(say(settingsPhrase(amrap, 2))).toBe(
      "Le plus de tours possible en 10', 30 s entre exercices",
    );
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(8),
      restBetweenExercisesSeconds: 30,
    });
    expect(say(settingsPhrase(intervals, 2))).toBe("8 tours : 20 s d'effort, 10 s de repos");
  });

  describe("un seul par bip", () => {
    it("cite les exercices en alternance quand le compte tombe juste", () => {
      expect(say(settingsPhrase(oneByBeep(60, 10), 2, ["KB swing", "Burpees"]))).toBe(
        "10 bips, chaque minute : KB swing et Burpees en alternance, 5 fois chacun",
      );
    });

    it("donne un passage de plus aux premiers quand il ne tombe pas juste", () => {
      expect(say(settingsPhrase(oneByBeep(60, 10), 3))).toBe(
        "10 bips, chaque minute : un exercice à chaque fois, 4 fois pour le premier, 3 pour les autres",
      );
      expect(say(settingsPhrase(oneByBeep(60, 8), 3))).toBe(
        "8 bips, chaque minute : un exercice à chaque fois, 3 fois pour les 2 premiers, 2 pour le dernier",
      );
    });

    it("parle d'intervalles avec effort et repos imposés", () => {
      const settings = settingsOf({
        advance: cycle(20, 10),
        repeat: rounds(5),
        order: StructureOrder.ONE,
      });
      expect(say(settingsPhrase(settings, 2))).toBe(
        "5 intervalles, 20 s d'effort et 10 s de repos : un exercice à chaque fois, 3 fois pour le premier, 2 pour l'autre",
      );
    });

    it("est `null` quand il y a moins de bips que d'exercices", () => {
      expect(settingsPhrase(oneByBeep(60, 2), 3)).toBeNull();
      expect(say(settingsPhrase(oneByBeep(60, 3), 3, ["A", "B", "C"]))).toBe(
        "3 bips, chaque minute : A, B et C en alternance, 1 fois chacun",
      );
    });

    it("se lit comme « tous à chaque bip » pour un seul exercice", () => {
      expect(say(settingsPhrase(oneByBeep(60, 10), 1))).toBe("10 séries, un bip chaque minute");
    });
  });
});

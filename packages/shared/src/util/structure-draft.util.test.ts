import { describe, expect, it } from "vitest";
import {
  asMuchAsPossible,
  beep,
  cycle,
  once,
  presets,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import {
  STRUCTURE_NAME_MAX_LENGTH,
  type StructureSettings,
  structureSettingsSchema,
} from "../dto/structure.schema";
import { StructureAdvance, StructureOrder, StructureRepeat } from "../dto/structure-answer.schema";
import {
  NEW_STRUCTURE_SETTINGS,
  STRUCTURE_DEFAULTS,
  StructureToggle,
  sameStructureName,
  structureCopyName,
  structureTimeline,
  TIMELINE_MAX_ROUNDS,
  takenStructureName,
  withAdvance,
  withoutDisabled,
  withRepeat,
  withSettingValue,
  withToggle,
} from "./structure-draft.util";
import { SettingValue, settingsIssues } from "./structure-settings.util";

/** Tous les repos et la limite posés : ce que chaque test voit disparaître ou rester. */
const everything = settingsOf({
  restBetweenExercisesSeconds: 30,
  restBetweenRoundsSeconds: 90,
  limitSeconds: 600,
});

describe("NEW_STRUCTURE_SETTINGS", () => {
  it("part de Séries, et s'enregistre telle quelle", () => {
    expect(NEW_STRUCTURE_SETTINGS).toEqual(presets.SERIES);
    expect(structureSettingsSchema.safeParse(NEW_STRUCTURE_SETTINGS).success).toBe(true);
  });
});

describe("withoutDisabled", () => {
  it("ne touche pas des réglages où rien n'est grisé", () => {
    expect(withoutDisabled(everything)).toEqual(everything);
  });

  it("avec un bip, retire les deux repos et la limite, que le bip déduit", () => {
    expect(withoutDisabled({ ...everything, advance: beep(60) })).toEqual(
      settingsOf({ advance: beep(60) }),
    );
  });

  it("avec un bip, ramène « autant que possible » et « une seule fois » à un nombre de tours", () => {
    expect(withoutDisabled(settingsOf({ advance: beep(60), repeat: once })).repeat).toEqual(
      rounds(STRUCTURE_DEFAULTS.rounds),
    );
    expect(
      withoutDisabled(settingsOf({ advance: cycle(20, 10), repeat: asMuchAsPossible(600) })).repeat,
    ).toEqual(rounds(STRUCTURE_DEFAULTS.rounds));
  });

  it("une seule fois : le repos entre tours tombe, celui entre exercices et la limite restent", () => {
    expect(withoutDisabled({ ...everything, repeat: once })).toEqual({
      ...everything,
      repeat: once,
      restBetweenRoundsSeconds: null,
    });
  });

  it("autant que possible : le repos entre tours et la limite tombent", () => {
    expect(withoutDisabled({ ...everything, repeat: asMuchAsPossible(600) })).toEqual({
      ...everything,
      repeat: asMuchAsPossible(600),
      restBetweenRoundsSeconds: null,
      limitSeconds: null,
    });
  });

  it("à son rythme, l'ordre revient à « tous » ; avec un bip, il reste", () => {
    expect(withoutDisabled(settingsOf({ order: StructureOrder.ONE })).order).toBe(
      StructureOrder.ALL,
    );
    expect(
      withoutDisabled(settingsOf({ advance: beep(60), order: StructureOrder.ONE })).order,
    ).toBe(StructureOrder.ONE);
  });

  it("rend toujours des réglages que le schéma accepte, quelles que soient les réponses", () => {
    const advances = [{ kind: StructureAdvance.ATHLETE } as const, beep(60), cycle(20, 10)];
    const repeats = [rounds(4), asMuchAsPossible(600), once];
    for (const advance of advances) {
      for (const repeat of repeats) {
        for (const order of Object.values(StructureOrder)) {
          const settings = withoutDisabled({ ...everything, advance, repeat, order });
          expect(settingsIssues(settings)).toEqual([]);
        }
      }
    }
  });
});

describe("withAdvance", () => {
  it("choisir un bip le pose toutes les minutes, et grise les repos", () => {
    expect(withAdvance(everything, StructureAdvance.BEEP)).toEqual(
      settingsOf({ advance: beep(STRUCTURE_DEFAULTS.everySeconds) }),
    );
  });

  it("choisir effort et repos imposés les pose à 20 s et 10 s", () => {
    expect(withAdvance(presets.SERIES, StructureAdvance.CYCLE).advance).toEqual(
      cycle(STRUCTURE_DEFAULTS.workSeconds, STRUCTURE_DEFAULTS.restSeconds),
    );
  });

  it("revenir à son rythme garde le nombre de tours", () => {
    expect(withAdvance(presets.TABATA, StructureAdvance.ATHLETE)).toEqual(
      settingsOf({ repeat: rounds(8) }),
    );
  });

  it("la réponse déjà choisie ne change rien, ses durées comprises", () => {
    const emom = settingsOf({ advance: beep(240), repeat: rounds(6) });
    expect(withAdvance(emom, StructureAdvance.BEEP)).toBe(emom);
  });
});

describe("withRepeat", () => {
  it("chaque réponse prend sa valeur par défaut", () => {
    expect(withRepeat(presets.FREE, StructureRepeat.ROUNDS).repeat).toEqual(
      rounds(STRUCTURE_DEFAULTS.rounds),
    );
    expect(withRepeat(presets.SERIES, StructureRepeat.MAX).repeat).toEqual(
      asMuchAsPossible(STRUCTURE_DEFAULTS.capSeconds),
    );
    expect(withRepeat(presets.SERIES, StructureRepeat.ONCE).repeat).toEqual(once);
  });

  it("une seule fois retire le repos entre tours", () => {
    expect(withRepeat(presets.SERIES, StructureRepeat.ONCE).restBetweenRoundsSeconds).toBeNull();
  });

  it("une réponse grisée par la question 1 ne se choisit pas", () => {
    expect(withRepeat(presets.EMOM, StructureRepeat.MAX)).toEqual(
      settingsOf({ advance: beep(60), repeat: rounds(STRUCTURE_DEFAULTS.rounds) }),
    );
  });

  it("la réponse déjà choisie garde son nombre", () => {
    expect(withRepeat(presets.TABATA, StructureRepeat.ROUNDS)).toBe(presets.TABATA);
  });
});

describe("withToggle", () => {
  it("coché, un réglage prend sa durée par défaut", () => {
    const free = settingsOf();
    expect(withToggle(free, StructureToggle.REST_BETWEEN_EXERCISES, true)).toEqual(
      settingsOf({ restBetweenExercisesSeconds: STRUCTURE_DEFAULTS.restBetweenExercisesSeconds }),
    );
    expect(withToggle(free, StructureToggle.REST_BETWEEN_ROUNDS, true)).toEqual(
      settingsOf({ restBetweenRoundsSeconds: STRUCTURE_DEFAULTS.restBetweenRoundsSeconds }),
    );
    expect(withToggle(free, StructureToggle.LIMIT, true)).toEqual(
      settingsOf({ limitSeconds: STRUCTURE_DEFAULTS.limitSeconds }),
    );
  });

  it("décoché, il se vide", () => {
    expect(withToggle(everything, StructureToggle.LIMIT, false).limitSeconds).toBeNull();
  });

  it("déjà dans l'état demandé, il garde sa valeur", () => {
    expect(withToggle(everything, StructureToggle.REST_BETWEEN_ROUNDS, true)).toBe(everything);
  });

  it("grisé, il reste vide", () => {
    expect(withToggle(presets.EMOM, StructureToggle.LIMIT, true)).toEqual(presets.EMOM);
  });
});

describe("withSettingValue", () => {
  it("change la valeur que porte la réponse choisie", () => {
    expect(withSettingValue(presets.EMOM, SettingValue.EVERY, 240).advance).toEqual(beep(240));
    expect(withSettingValue(presets.TABATA, SettingValue.WORK, 40).advance).toEqual(cycle(40, 10));
    expect(withSettingValue(presets.TABATA, SettingValue.REST, 20).advance).toEqual(cycle(20, 20));
    expect(withSettingValue(presets.SERIES, SettingValue.ROUNDS, 5).repeat).toEqual(rounds(5));
    expect(withSettingValue(presets.AMRAP, SettingValue.CAP, 900).repeat).toEqual(
      asMuchAsPossible(900),
    );
  });

  it("change un repos ou la limite cochés", () => {
    expect(
      withSettingValue(everything, SettingValue.REST_BETWEEN_EXERCISES, 45)
        .restBetweenExercisesSeconds,
    ).toBe(45);
    expect(
      withSettingValue(everything, SettingValue.REST_BETWEEN_ROUNDS, 180).restBetweenRoundsSeconds,
    ).toBe(180);
    expect(withSettingValue(everything, SettingValue.LIMIT, 1200).limitSeconds).toBe(1200);
  });

  it("ignore une valeur que la réponse choisie ne porte pas", () => {
    const free = settingsOf();
    for (const value of Object.values(SettingValue)) {
      if (value === SettingValue.ROUNDS) continue;
      expect(withSettingValue(free, value, 42)).toBe(free);
    }
    expect(withSettingValue(presets.FREE, SettingValue.ROUNDS, 5)).toBe(presets.FREE);
    expect(withSettingValue(presets.SERIES, SettingValue.CAP, 5)).toBe(presets.SERIES);
  });
});

describe("structureTimeline", () => {
  const work = (round: number | null) => ({ kind: "work", round }) as const;
  const rest = { kind: "rest" } as const;

  it("des séries avec repos : un repos ENTRE deux tours, pas après le dernier", () => {
    const timeline = structureTimeline(
      settingsOf({ repeat: rounds(3), restBetweenRoundsSeconds: 120 }),
    );
    expect(timeline.segments).toEqual([work(1), rest, work(2), rest, work(3)]);
    expect(timeline.legend).toEqual({ kind: "ownPace", capSeconds: null, restSeconds: 120 });
    expect(timeline.axisSeconds).toBeNull();
  });

  it("un cycle se repose après chaque effort, et sa durée se lit sur l'axe", () => {
    const timeline = structureTimeline(settingsOf({ advance: cycle(20, 10), repeat: rounds(2) }));
    expect(timeline.segments).toEqual([work(1), rest, work(2), rest]);
    expect(timeline.legend).toEqual({ kind: "cycle", workSeconds: 20, restSeconds: 10 });
    expect(timeline.axisSeconds).toEqual([0, 30, 60]);
  });

  it("un bip : des tours sans repos, et l'axe arrondi à la seconde", () => {
    const timeline = structureTimeline(settingsOf({ advance: beep(45), repeat: rounds(3) }));
    expect(timeline.segments).toEqual([work(1), work(2), work(3)]);
    expect(timeline.legend).toEqual({ kind: "beep", everySeconds: 45 });
    expect(timeline.axisSeconds).toEqual([0, 68, 135]);
  });

  it("autant que possible : quelques tours muets, pendant le temps donné", () => {
    const timeline = structureTimeline(presets.AMRAP);
    expect(timeline.segments).toEqual(Array.from({ length: 6 }, () => work(null)));
    expect(timeline.legend).toEqual({ kind: "ownPace", capSeconds: 720, restSeconds: null });
  });

  it("une seule fois : un seul passage", () => {
    expect(structureTimeline(presets.FREE).segments).toEqual([work(1)]);
  });

  it("au-delà de 24 tours, la frise montre les premiers", () => {
    const timeline = structureTimeline(settingsOf({ repeat: rounds(99) }));
    expect(timeline.segments).toHaveLength(TIMELINE_MAX_ROUNDS);
    expect(timeline.segments.at(-1)).toEqual(work(TIMELINE_MAX_ROUNDS));
  });

  it("au-delà de 24 tours, l'axe gradue les tours dessinés, pas le bloc entier", () => {
    const timeline = structureTimeline(settingsOf({ advance: beep(60), repeat: rounds(50) }));
    expect(timeline.axisSeconds).toEqual([0, 720, 1440]);
  });
});

describe("sameStructureName", () => {
  it("ignore les majuscules et les espaces de bord", () => {
    expect(sameStructureName("4×4 grimpe", "  4×4 GRIMPE ")).toBe(true);
  });

  it("garde les accents : ce sont deux noms", () => {
    expect(sameStructureName("Départ", "Depart")).toBe(false);
  });

  it("un accent saisi en deux caractères reste le même nom", () => {
    expect(sameStructureName("Départ", "De\u0301part")).toBe(true);
  });
});

describe("takenStructureName", () => {
  const mine = [
    { id: "s1", name: "4×4 grimpe" },
    { id: "s2", name: "Tabata 30/10" },
  ];

  it("un nom porté par une autre structure est pris, et rend son nom à elle", () => {
    expect(takenStructureName("4×4 Grimpe", mine, null)).toBe("4×4 grimpe");
    expect(takenStructureName("4×4 Grimpe", mine, "s2")).toBe("4×4 grimpe");
  });

  it("la structure modifiée garde le sien", () => {
    expect(takenStructureName("4×4 GRIMPE", mine, "s1")).toBeNull();
  });

  it("même porté par une autre, un doublon d'avant la règle", () => {
    const doubled = [...mine, { id: "s3", name: "4×4 GRIMPE" }];
    expect(takenStructureName("4×4 grimpe", doubled, "s3")).toBeNull();
    // Mais il ne prend pas celui de l'autre en changeant de nom.
    expect(takenStructureName("Tabata 30/10", doubled, "s3")).toBe("Tabata 30/10");
  });

  it("un nom neuf, ou vide, n'est pas pris", () => {
    expect(takenStructureName("Départs 4 min", mine, null)).toBeNull();
    expect(takenStructureName("  ", [{ id: "s3", name: "" }], null)).toBeNull();
  });
});

describe("structureCopyName", () => {
  const format = (base: string, n: number) =>
    n === 1 ? `${base} (copie)` : `${base} (copie ${n})`;

  it("ajoute « (copie) » à la base", () => {
    expect(structureCopyName("Tabata", [], format)).toBe("Tabata (copie)");
  });

  it("numérote la copie quand le nom est pris, sans tenir compte des majuscules", () => {
    expect(structureCopyName("Tabata", ["tabata (COPIE)", "Tabata (copie 2)"], format)).toBe(
      "Tabata (copie 3)",
    );
  });

  it("rogne la base pour que la copie tienne dans la longueur permise", () => {
    const base = `${"a".repeat(STRUCTURE_NAME_MAX_LENGTH - 2)} b`;
    const name = structureCopyName(base, [], format);
    expect(name).toHaveLength(STRUCTURE_NAME_MAX_LENGTH);
    expect(name.endsWith("a (copie)")).toBe(true);
  });

  it("rogne aussi les espaces que la coupe laisse au bout de la base", () => {
    const base = `${"a".repeat(STRUCTURE_NAME_MAX_LENGTH - 9)}  ${"b".repeat(8)}`;
    expect(structureCopyName(base, [], format)).toBe(
      `${"a".repeat(STRUCTURE_NAME_MAX_LENGTH - 9)} (copie)`,
    );
  });

  it("une forme qui dépasse la borne à elle seule ne garde rien de la base", () => {
    const long = (base: string) => `${base}${"x".repeat(STRUCTURE_NAME_MAX_LENGTH + 2)}`;
    expect(structureCopyName("abc", [], long)).toBe(long(""));
  });
});

describe("le brouillon reste enregistrable", () => {
  it("de chaque structure prête, chaque geste rend des réglages valides", () => {
    const gestures: ((settings: StructureSettings) => StructureSettings)[] = [
      ...Object.values(StructureAdvance).map(
        (kind) => (settings: StructureSettings) => withAdvance(settings, kind),
      ),
      ...Object.values(StructureRepeat).map(
        (kind) => (settings: StructureSettings) => withRepeat(settings, kind),
      ),
      ...Object.values(StructureToggle).flatMap((toggle) =>
        [true, false].map(
          (on) => (settings: StructureSettings) => withToggle(settings, toggle, on),
        ),
      ),
    ];
    for (const preset of Object.values(presets)) {
      for (const gesture of gestures) {
        expect(structureSettingsSchema.safeParse(gesture(preset)).success).toBe(true);
      }
    }
  });
});

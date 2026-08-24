import { describe, expect, it } from "vitest";
import {
  copyPlanWeekSchema,
  createPlanSchema,
  createScheduledSessionSchema,
  updateScheduledSessionSchema,
} from "./plan.schema";

const MONDAY = "2026-10-12";

describe("createPlanSchema", () => {
  it("accepte un cycle démarrant un lundi, semaines par défaut vides", () => {
    const parsed = createPlanSchema.parse({
      athleteId: "ath_1",
      title: "Cycle bloc",
      startDate: MONDAY,
    });
    expect(parsed.weeks).toEqual([]);
  });

  it("refuse une date de début qui n'est pas un lundi", () => {
    const result = createPlanSchema.safeParse({
      athleteId: "ath_1",
      title: "Cycle bloc",
      startDate: "2026-10-13",
    });
    expect(result.success).toBe(false);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    const result = createPlanSchema.safeParse({
      athleteId: "ath_1",
      title: "Cycle bloc",
      startDate: MONDAY,
      coachId: "coach_intrus",
    });
    expect(result.success).toBe(false);
  });
});

describe("createScheduledSessionSchema", () => {
  it("accepte une instanciation depuis un modèle sans titre (il sera copié)", () => {
    const result = createScheduledSessionSchema.safeParse({
      sourceSessionId: "ses_1",
      scheduledDate: "2026-10-14",
    });
    expect(result.success).toBe(true);
  });

  it("exige un titre pour une séance ad hoc (sans modèle source)", () => {
    const result = createScheduledSessionSchema.safeParse({ scheduledDate: "2026-10-14" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["title"]);
  });
});

describe("updateScheduledSessionSchema", () => {
  it("porte la composition complète (replace-all) — l'ordre définit les positions", () => {
    const parsed = updateScheduledSessionSchema.parse({
      title: "Bloc force max",
      notes: null,
      scheduledDate: "2026-10-14",
      exercises: [
        { sourceExerciseId: "ex_1", title: "Échauffement" },
        { title: "Tractions", tags: ["renfo"], prescription: "5×5" },
      ],
    });
    expect(parsed.exercises).toHaveLength(2);
    expect(parsed.exercises[1]?.sourceExerciseId).toBeUndefined();
  });

  it("refuse un champ inconnu dans la composition (schéma strict)", () => {
    // `category` en fait partie depuis #163 : l'envoyer encore est une erreur d'appel, pas une
    // donnée ignorée en silence.
    const result = updateScheduledSessionSchema.safeParse({
      title: "Bloc",
      scheduledDate: "2026-10-14",
      exercises: [{ title: "x", category: "RENFO" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("copyPlanWeekSchema", () => {
  it("ne demande que la semaine source (la cible est la ressource de la route)", () => {
    const parsed = copyPlanWeekSchema.parse({ sourcePlanWeekId: "pw_1" });
    expect(parsed.sourcePlanWeekId).toBe("pw_1");
  });

  it("refuse une source absente ou vide", () => {
    expect(copyPlanWeekSchema.safeParse({}).success).toBe(false);
    expect(copyPlanWeekSchema.safeParse({ sourcePlanWeekId: "" }).success).toBe(false);
  });

  // Le client ne choisit AUCUNE date : elles se déduisent de la semaine cible. Les accepter,
  // même ignorées, laisserait croire qu'on peut poser une séance hors de la plage de sa semaine.
  it("refuse toute date proposée par le client (schéma strict)", () => {
    const result = copyPlanWeekSchema.safeParse({
      sourcePlanWeekId: "pw_1",
      scheduledDate: "2026-10-14",
    });
    expect(result.success).toBe(false);
  });
});

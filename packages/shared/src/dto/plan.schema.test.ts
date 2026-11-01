import { describe, expect, it } from "vitest";
import {
  copyPlanWeekSchema,
  createPlanSchema,
  createScheduledSessionSchema,
  publishPlanSchema,
  reorderPlanDaySchema,
  updatePlanSchema,
  updatePlanWeekSchema,
  updateScheduledSessionSchema,
  versionQuerySchema,
} from "./plan.schema";

const MONDAY = "2026-10-12";
const VERSION = "2026-10-12T08:00:00.000Z";

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

describe("updatePlanSchema", () => {
  // L'en-tête d'un cycle peut être retouché par deux Coachs : la version lue part avec (#604).
  it("exige la version sur laquelle la saisie a commencé", () => {
    expect(updatePlanSchema.safeParse({ title: "Bloc" }).success).toBe(false);
    expect(updatePlanSchema.safeParse({ title: "Bloc", expectedUpdatedAt: VERSION }).success).toBe(
      true,
    );
  });
});

describe("createScheduledSessionSchema", () => {
  it("pose une séance depuis un modèle, dont elle copie titre et blocs", () => {
    const result = createScheduledSessionSchema.safeParse({
      sourceSessionId: "ses_1",
      scheduledDate: "2026-10-14",
    });
    expect(result.success).toBe(true);
  });

  it("refuse une séance sans modèle : elle n'aurait aucun bloc d'où partir (#723)", () => {
    expect(
      createScheduledSessionSchema.safeParse({ title: "Libre", scheduledDate: "2026-10-14" })
        .success,
    ).toBe(false);
  });
});

describe("updateScheduledSessionSchema", () => {
  it("porte titre, notes et jour : la composition s'écrit geste par geste (#720)", () => {
    const parsed = updateScheduledSessionSchema.parse({
      title: "Bloc force max",
      scheduledDate: "2026-10-14",
      expectedUpdatedAt: VERSION,
    });
    expect(parsed.title).toBe("Bloc force max");
  });

  it("refuse l'ancienne composition par exercices (schéma strict)", () => {
    const result = updateScheduledSessionSchema.safeParse({
      title: "Bloc",
      scheduledDate: "2026-10-14",
      exercises: [{ title: "Tractions" }],
      expectedUpdatedAt: VERSION,
    });
    expect(result.success).toBe(false);
  });
});

describe("copyPlanWeekSchema", () => {
  it("ne demande que la semaine source (la cible est la ressource de la route)", () => {
    const parsed = copyPlanWeekSchema.parse({
      sourcePlanWeekId: "pw_1",
      expectedUpdatedAt: VERSION,
    });
    expect(parsed.sourcePlanWeekId).toBe("pw_1");
  });

  it("refuse une source absente ou vide", () => {
    expect(copyPlanWeekSchema.safeParse({ expectedUpdatedAt: VERSION }).success).toBe(false);
    expect(
      copyPlanWeekSchema.safeParse({ sourcePlanWeekId: "", expectedUpdatedAt: VERSION }).success,
    ).toBe(false);
  });

  // Le client ne choisit AUCUNE date : elles se déduisent de la semaine cible. Les accepter,
  // même ignorées, laisserait croire qu'on peut poser une séance hors de la plage de sa semaine.
  it("refuse toute date proposée par le client (schéma strict)", () => {
    const result = copyPlanWeekSchema.safeParse({
      sourcePlanWeekId: "pw_1",
      expectedUpdatedAt: VERSION,
      scheduledDate: "2026-10-14",
    });
    expect(result.success).toBe(false);
  });
});

describe("reorderPlanDaySchema", () => {
  it("ne demande que l'ordre voulu (la journée est la ressource de la route)", () => {
    const parsed = reorderPlanDaySchema.parse({
      sessionIds: ["ss_2", "ss_1"],
      expectedUpdatedAt: VERSION,
    });
    expect(parsed.sessionIds).toEqual(["ss_2", "ss_1"]);
  });

  /**
   * Une journée d'une seule séance se réordonne sans rien changer : un client qui renvoie ce
   * qu'il affiche ne doit pas recevoir un 400. Une journée VIDE, elle, n'a rien à réordonner.
   */
  it("accepte une seule séance mais refuse une liste vide", () => {
    const day = (sessionIds: string[]) =>
      reorderPlanDaySchema.safeParse({ sessionIds, expectedUpdatedAt: VERSION }).success;
    expect(day(["ss_1"])).toBe(true);
    expect(day([])).toBe(false);
  });

  it("refuse un identifiant vide", () => {
    expect(
      reorderPlanDaySchema.safeParse({ sessionIds: ["ss_1", ""], expectedUpdatedAt: VERSION })
        .success,
    ).toBe(false);
  });

  // La date et la semaine sont dans l'URL. Les accepter dans le corps, même ignorées, laisserait
  // croire qu'on peut réordonner une journée autre que celle qu'on adresse.
  it("refuse une journée proposée dans le corps (schéma strict)", () => {
    const result = reorderPlanDaySchema.safeParse({
      sessionIds: ["ss_1"],
      expectedUpdatedAt: VERSION,
      scheduledDate: "2026-10-14",
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Les gestes sur une semaine citent la version de la semaine affichée, l'édition d'une séance celle
 * de la séance ouverte, la diffusion et le retrait d'un cycle celle du cycle affiché (#604) : sans
 * elle, une écriture fondée sur ce qu'un autre Coach a changé depuis défait son travail sans un mot.
 */
describe("version lue (#604)", () => {
  it.each([
    ["le type ou la note", updatePlanWeekSchema, { type: "TRAINING" }],
    ["le collage", copyPlanWeekSchema, { sourcePlanWeekId: "pw_1" }],
    ["l'ordre d'une journée", reorderPlanDaySchema, { sessionIds: ["ss_1"] }],
    ["le retrait d'un cycle, d'une semaine ou d'une séance", versionQuerySchema, {}],
    ["la diffusion d'un cycle", publishPlanSchema, {}],
    [
      "l'édition d'une séance",
      updateScheduledSessionSchema,
      { title: "Bloc", scheduledDate: "2026-10-14" },
    ],
  ] as const)("l'exige pour %s", (_gesture, schema, fields) => {
    expect(schema.safeParse(fields).success).toBe(false);
    expect(schema.safeParse({ ...fields, expectedUpdatedAt: VERSION }).success).toBe(true);
  });
});

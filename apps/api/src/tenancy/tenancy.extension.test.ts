import { required } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { TENANT_SCOPES, tenantField } from "./tenancy.extension";

const TRAINING_MODELS = Object.entries(TENANT_SCOPES).filter(([, scope]) => scope.company == null);

describe("tenantField", () => {
  it("scope un modèle d'entraînement sur la colonne de la capacité exercée", () => {
    expect(tenantField({ coach: "coachId", athlete: "athleteId" }, "coach")).toBe("coachId");
    expect(tenantField({ coach: "coachId", athlete: "athleteId" }, "athlete")).toBe("athleteId");
  });

  // `Reminder` : l'outil privé du coach n'a pas de scope athlète, l'athlète n'y entre pas.
  it("refuse la capacité athlète sur un modèle sans scope athlète", () => {
    expect(tenantField({ coach: "coachId" }, "athlete")).toBeNull();
  });

  /**
   * Lus par l'athlète IMBRIQUÉS dans la séance ou le cycle, jamais à plat — ou pas du tout pour la
   * fiche (#626) : leur clé athlète est fermée. Rouvrir l'une d'elles est une décision, pas un oubli.
   */
  it.each([
    "AthleteSheet",
    "PlanWeek",
    "ScheduledSessionExerciseDocument",
    "ScheduledSessionExerciseTag",
  ])("ferme %s à la capacité athlète, et le laisse au coach", (model) => {
    const scope = required(TENANT_SCOPES[model], `${model} absente du registre`);
    expect(tenantField(scope, "athlete")).toBeNull();
    expect(tenantField(scope, "coach")).toBe("coachId");
  });

  // `Notification`, `PushToken` : un seul destinataire, pas de titre à choisir.
  it("sans capacité exercée, n'ouvre que les modèles au champ commun aux deux", () => {
    expect(tenantField({ coach: "userId", athlete: "userId" }, null)).toBe("userId");
    expect(tenantField({ coach: "coachId", athlete: "athleteId" }, null)).toBeNull();
  });

  /**
   * Le refus STRUCTUREL de #600 : aucun modèle d'entraînement du registre n'a de clé `company`.
   * Parcourir le registre réel plutôt qu'un exemple : un modèle ajouté demain est vérifié aussi.
   */
  it.each(TRAINING_MODELS)("ferme %s au compte Entreprise", (_model, scope) => {
    expect(tenantField(scope, "company")).toBeNull();
  });

  /**
   * `Invitation` (#601), seul modèle émis par l'un OU l'autre : chaque émetteur sur sa colonne.
   * Le destinataire n'a pas de scope — l'athlète, comme le Coach invité, la lit par l'adresse.
   */
  it("ouvre l'invitation à ses deux émetteurs, chacun sur sa colonne", () => {
    const scope = required(TENANT_SCOPES.Invitation, "Invitation absente du registre");
    expect(tenantField(scope, "coach")).toBe("coachId");
    expect(tenantField(scope, "company")).toBe("organizationId");
    expect(tenantField(scope, "athlete")).toBeNull();
    expect(tenantField(scope, null)).toBeNull();
  });

  // Ses Coachs (#601) et ses athlètes (#602) : l'athlète d'une entreprise n'y lit rien non plus.
  it.each([
    "OrganizationCoach",
    "OrganizationAthlete",
  ])("ouvre %s à la seule entreprise", (model) => {
    const scope = required(TENANT_SCOPES[model], `${model} absente du registre`);
    expect(tenantField(scope, "company")).toBe("organizationId");
    expect(tenantField(scope, "coach")).toBeNull();
    expect(tenantField(scope, "athlete")).toBeNull();
  });

  // Le suivi né d'une entreprise reste un modèle d'entraînement : elle n'en voit rien (#602).
  it("ferme les liens coach-athlète à l'entreprise", () => {
    const scope = required(TENANT_SCOPES.CoachAthlete, "CoachAthlete absente du registre");
    expect(tenantField(scope, "company")).toBeNull();
  });

  it("ouvre l'entreprise à la seule capacité Entreprise", () => {
    const scope = required(TENANT_SCOPES.Organization, "Organization absente du registre");
    expect(tenantField(scope, "company")).toBe("id");
    expect(tenantField(scope, "coach")).toBeNull();
    expect(tenantField(scope, "athlete")).toBeNull();
    expect(tenantField(scope, null)).toBeNull();
  });
});

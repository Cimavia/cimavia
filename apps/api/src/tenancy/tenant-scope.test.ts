import { type CapabilityName, required } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  type CapabilityScope,
  column,
  creationDataOrThrow,
  type OperationClass,
  operationKindOf,
  scopeFor,
  TENANT_SCOPES,
  type TenantScope,
  throughRoot,
} from "./tenant-scope";

const ACTOR = "acteur-1";
const CLASSES: OperationClass[] = ["read", "write", "admin"];
const TRAINING_MODELS = Object.entries(TENANT_SCOPES).filter(([, scope]) => scope.company == null);

/** Le `where` qu'une capacité pose sur un modèle, ou `null` si elle n'y a pas accès. */
function whereOf(
  scope: TenantScope,
  capability: CapabilityName | null,
  operation: OperationClass = "read",
) {
  return scopeFor(scope, capability)?.where(ACTOR, operation) ?? null;
}

const scopeOf = (model: string): TenantScope =>
  required(TENANT_SCOPES[model], `${model} absente du registre`);

describe("column", () => {
  it("compare la colonne à l'acteur, la même pour les trois classes", () => {
    const scope = column("coachId");
    for (const operation of CLASSES) {
      expect(scope.where(ACTOR, operation)).toEqual({ coachId: ACTOR });
    }
  });

  it("remplit cette colonne à la création", () => {
    expect(creationDataOrThrow(column("coachId"), "Exercise", ACTOR)).toEqual({ coachId: ACTOR });
  });
});

describe("throughRoot", () => {
  // Une racine dont le filtre dépend de la classe : le seul moyen de voir laquelle lui arrive.
  const root: CapabilityScope = {
    where: (actorId, operation) => ({ coachId: actorId, level: operation }),
    owner: "coachId",
  };

  it.each(CLASSES)("filtre l'enfant par sa racine, pour la même classe (%s)", (operation) => {
    expect(throughRoot("exercise", root).where(ACTOR, operation)).toEqual({
      exercise: { coachId: ACTOR, level: operation },
    });
  });

  // Un filtre de relation ne s'écrit pas dans la ligne : l'enfant reprend le propriétaire du parent.
  it("refuse la création par injection de l'acteur", () => {
    expect(() =>
      creationDataOrThrow(throughRoot("exercise", root), "ExerciseDocument", ACTOR),
    ).toThrow("[tenancy] ExerciseDocument ne se crée pas en y injectant l'acteur");
  });
});

describe("operationKindOf", () => {
  const child = scopeOf("ExerciseDocument");

  it.each([
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
  ])("%s est une lecture ciblée", (operation) => {
    expect(operationKindOf(child, operation)).toEqual({ operationClass: "read", creates: false });
  });

  it.each(["create", "createMany", "createManyAndReturn"])("%s est une création", (operation) => {
    expect(operationKindOf(child, operation)).toEqual({ operationClass: "write", creates: true });
  });

  it.each(["update", "updateMany"])("%s est une écriture ciblée", (operation) => {
    expect(operationKindOf(child, operation)).toEqual({ operationClass: "write", creates: false });
  });

  // Supprimer un exercice, une séance ou une planification reste au propriétaire (#593).
  it.each(["Exercise", "Session", "Plan"])("supprimer %s est de l'administration", (model) => {
    for (const operation of ["delete", "deleteMany"]) {
      expect(operationKindOf(scopeOf(model), operation)).toEqual({
        operationClass: "admin",
        creates: false,
      });
    }
  });

  // Retirer une semaine ou un document, c'est écrire dans l'élément.
  it.each(["ExerciseDocument", "PlanWeek"])("supprimer %s est une écriture", (model) => {
    for (const operation of ["delete", "deleteMany"]) {
      expect(operationKindOf(scopeOf(model), operation)).toEqual({
        operationClass: "write",
        creates: false,
      });
    }
  });

  it.each(["upsert", "executeRaw"])("refuse de classer %s", (operation) => {
    expect(operationKindOf(child, operation)).toBeNull();
  });
});

describe("scopeFor", () => {
  /**
   * Aucun droit accordé avant #605 : chaque modèle actuel se lit, s'écrit et s'administre par la
   * même colonne. Le jour où l'un s'en écarte, c'est une décision, et ce test le dit.
   */
  it.each(
    Object.entries(TENANT_SCOPES),
  )("%s pose le même filtre pour les trois classes", (_, scope) => {
    for (const capability of ["coach", "athlete", "company", null] as const) {
      const read = whereOf(scope, capability, "read");
      expect(whereOf(scope, capability, "write")).toEqual(read);
      expect(whereOf(scope, capability, "admin")).toEqual(read);
    }
  });

  it("scope un modèle d'entraînement sur la colonne de la capacité exercée", () => {
    const scope: TenantScope = { coach: column("coachId"), athlete: column("athleteId") };
    expect(whereOf(scope, "coach")).toEqual({ coachId: ACTOR });
    expect(whereOf(scope, "athlete")).toEqual({ athleteId: ACTOR });
  });

  // `Reminder` : l'outil privé du coach n'a pas de scope athlète, l'athlète n'y entre pas.
  it("refuse la capacité athlète sur un modèle sans scope athlète", () => {
    expect(scopeFor({ coach: column("coachId") }, "athlete")).toBeNull();
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
    expect(whereOf(scopeOf(model), "athlete")).toBeNull();
    expect(whereOf(scopeOf(model), "coach")).toEqual({ coachId: ACTOR });
  });

  /**
   * `Notification`, `PushToken` : un seul destinataire, pas de titre à choisir. C'est l'IDENTITÉ du
   * scope qui ouvre la route sans capacité, pas deux scopes qui se ressembleraient.
   */
  it("sans capacité exercée, n'ouvre que les modèles au scope commun aux deux", () => {
    const shared = column("userId");
    expect(scopeFor({ coach: shared, athlete: shared }, null)).toBe(shared);
    expect(scopeFor({ coach: column("userId"), athlete: column("userId") }, null)).toBeNull();
    expect(scopeFor({ coach: column("coachId"), athlete: column("athleteId") }, null)).toBeNull();
  });

  it.each([
    ["Notification", { recipientId: ACTOR }],
    ["PushToken", { userId: ACTOR }],
    ["NotificationEmailPreference", { userId: ACTOR }],
  ])("ouvre %s à une route sans capacité", (model, where) => {
    expect(whereOf(scopeOf(model), null)).toEqual(where);
  });

  /**
   * Le refus STRUCTUREL de #600 : aucun modèle d'entraînement du registre n'a de clé `company`.
   * Parcourir le registre réel plutôt qu'un exemple : un modèle ajouté demain est vérifié aussi.
   */
  it.each(TRAINING_MODELS)("ferme %s au compte Entreprise", (_model, scope) => {
    expect(scopeFor(scope, "company")).toBeNull();
  });

  /**
   * `Invitation` (#601), seul modèle émis par l'un OU l'autre : chaque émetteur sur sa colonne.
   * Le destinataire n'a pas de scope — l'athlète, comme le Coach invité, la lit par l'adresse.
   */
  it("ouvre l'invitation à ses deux émetteurs, chacun sur sa colonne", () => {
    const scope = scopeOf("Invitation");
    expect(whereOf(scope, "coach")).toEqual({ coachId: ACTOR });
    expect(whereOf(scope, "company")).toEqual({ organizationId: ACTOR });
    expect(whereOf(scope, "athlete")).toBeNull();
    expect(whereOf(scope, null)).toBeNull();
  });

  // Ses Coachs (#601) et ses athlètes (#602) : l'athlète d'une entreprise n'y lit rien non plus.
  it.each([
    "OrganizationCoach",
    "OrganizationAthlete",
  ])("ouvre %s à la seule entreprise", (model) => {
    const scope = scopeOf(model);
    expect(whereOf(scope, "company")).toEqual({ organizationId: ACTOR });
    expect(whereOf(scope, "coach")).toBeNull();
    expect(whereOf(scope, "athlete")).toBeNull();
  });

  // Le suivi né d'une entreprise reste un modèle d'entraînement : elle n'en voit rien (#602).
  it("ferme les liens coach-athlète à l'entreprise", () => {
    expect(whereOf(scopeOf("CoachAthlete"), "company")).toBeNull();
  });

  it("ouvre l'entreprise à la seule capacité Entreprise", () => {
    const scope = scopeOf("Organization");
    expect(whereOf(scope, "company")).toEqual({ id: ACTOR });
    expect(whereOf(scope, "coach")).toBeNull();
    expect(whereOf(scope, "athlete")).toBeNull();
    expect(whereOf(scope, null)).toBeNull();
  });
});

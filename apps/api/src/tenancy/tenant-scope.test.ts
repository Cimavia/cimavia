import { type CapabilityName, required } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  type CapabilityScope,
  childOf,
  column,
  type OperationClass,
  operationKindOf,
  ownerColumnOrThrow,
  type ParentLink,
  parentIdsOrThrow,
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

  it("remplit cette colonne à la création, avec l'acteur", () => {
    expect(ownerColumnOrThrow(column("coachId"), "Exercise")).toBe("coachId");
    expect(column("coachId").parent).toBeNull();
  });
});

describe("throughRoot", () => {
  // Une racine dont le filtre dépend de la classe : le seul moyen de voir laquelle lui arrive.
  const root: CapabilityScope = {
    where: (actorId, operation) => ({ coachId: actorId, level: operation }),
    owner: "coachId",
    parent: null,
  };

  it.each(CLASSES)("filtre l'enfant par sa racine, pour la même classe (%s)", (operation) => {
    expect(throughRoot("exercise", root).where(ACTOR, operation)).toEqual({
      exercise: { coachId: ACTOR, level: operation },
    });
  });

  // Un filtre de relation ne s'écrit pas dans la ligne : il ne dit pas quelle colonne remplir.
  it("ne crée rien sous ce scope", () => {
    expect(() => ownerColumnOrThrow(throughRoot("exercise", root), "ExerciseDocument")).toThrow(
      "[tenancy] ExerciseDocument ne se crée pas sous ce scope",
    );
  });
});

describe("childOf", () => {
  const exercise: ParentLink = { model: "Exercise", key: "exerciseId" };

  it("filtre comme son scope, et désigne le parent dont il reprend le propriétaire", () => {
    const scope = childOf(column("coachId"), exercise);
    expect(scope.where(ACTOR, "write")).toEqual({ coachId: ACTOR });
    expect(scope.owner).toBe("coachId");
    expect(scope.parent).toEqual(exercise);
  });

  /**
   * Les enfants que le Coach crée suivent leur racine (#593) ; le débrief et ses médias, que crée
   * l'athlète, n'en ont pas : leur colonne est celle de l'acteur.
   */
  it.each([
    ["ExerciseDocument", "Exercise", "exerciseId"],
    ["ExerciseTag", "Exercise", "exerciseId"],
    ["SessionExercise", "Session", "sessionId"],
    ["PlanWeek", "Plan", "planId"],
    ["ScheduledSession", "Plan", "planId"],
    ["ScheduledSessionExercise", "ScheduledSession", "scheduledSessionId"],
    ["ScheduledSessionExerciseDocument", "ScheduledSessionExercise", "scheduledSessionExerciseId"],
    ["ScheduledSessionExerciseTag", "ScheduledSessionExercise", "scheduledSessionExerciseId"],
  ])("%s se crée sous son %s", (model, parent, key) => {
    expect(scopeOf(model).coach?.parent).toEqual({ model: parent, key });
  });

  it("la facture suit sa planification, si elle en a une", () => {
    expect(scopeOf("Invoice").coach?.parent).toEqual({
      model: "Plan",
      key: "planId",
      optional: true,
    });
  });

  it.each([
    "Exercise",
    "Session",
    "Plan",
    "SessionFeedback",
    "FeedbackMedia",
  ])("%s se crée avec l'acteur", (model) => {
    expect(scopeOf(model).coach?.parent).toBeNull();
  });
});

describe("parentIdsOrThrow", () => {
  const exercise: ParentLink = { model: "Exercise", key: "exerciseId" };
  const plan: ParentLink = { model: "Plan", key: "planId", optional: true };

  it("rend les parents désignés, sans doublon", () => {
    const rows = [{ exerciseId: "e1" }, { exerciseId: "e2" }, { exerciseId: "e1" }];
    expect(parentIdsOrThrow(rows, exercise, "ExerciseTag")).toEqual(["e1", "e2"]);
  });

  // Une relation écrite `connect`, ou rien du tout : la lecture du parent passerait à côté.
  it.each([
    [{ exercise: { connect: { id: "e1" } } }],
    [{ exerciseId: null }],
  ])("refuse une ligne qui ne porte pas la clé de son parent (%o)", (row) => {
    expect(() => parentIdsOrThrow([row], exercise, "ExerciseTag")).toThrow(
      "[tenancy] ExerciseTag se crée avec son exerciseId : son propriétaire est celui de son Exercise",
    );
  });

  // `null` dit « sans parent » ; une clé absente ne dit rien, et reste refusée.
  it("admet un parent optionnel à null, pas absent", () => {
    expect(parentIdsOrThrow([{ planId: null }, { planId: "p1" }], plan, "Invoice")).toEqual(["p1"]);
    expect(() => parentIdsOrThrow([{}], plan, "Invoice")).toThrow(
      "[tenancy] Invoice se crée avec son planId : son propriétaire est celui de son Plan",
    );
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

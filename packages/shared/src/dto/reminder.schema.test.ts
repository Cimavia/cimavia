import { describe, expect, it } from "vitest";
import {
  createReminderSchema,
  REMINDER_NOTE_MAX_LENGTH,
  ReminderEntityType,
  ReminderStatus,
  reminderDtoSchema,
  reminderSummaryDtoSchema,
  updateReminderSchema,
  updateReminderStatusSchema,
} from "./reminder.schema";

const CREATE = {
  entityType: ReminderEntityType.PLAN,
  entityId: "pln_1",
  dueAt: "2026-08-15T07:00:00.000Z",
  note: "Relancer le renouvellement du cycle",
};

describe("createReminderSchema", () => {
  it("accepte un rappel sur un cycle et sur une facture", () => {
    expect(createReminderSchema.safeParse(CREATE).success).toBe(true);
    expect(
      createReminderSchema.safeParse({ ...CREATE, entityType: ReminderEntityType.INVOICE }).success,
    ).toBe(true);
  });

  /**
   * `dueAt` est un INSTANT, pas une date civile comme `Plan.startDate` : une valeur sans heure est
   * refusée. C'est ce qui empêche un client d'envoyer « 2026-08-15 » et de laisser l'API décider
   * d'un fuseau à sa place.
   */
  it("refuse une échéance sans heure", () => {
    expect(createReminderSchema.safeParse({ ...CREATE, dueAt: "2026-08-15" }).success).toBe(false);
  });

  // Aucune contrainte de futur : une échéance passée est simplement due tout de suite. La refuser
  // exposerait le formulaire au décalage d'horloge entre le navigateur et l'API.
  it("accepte une échéance déjà passée", () => {
    expect(
      createReminderSchema.safeParse({ ...CREATE, dueAt: "2020-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
  });

  // La note EST le rappel : vide, la ligne n'aurait rien à afficher.
  it("exige une note non vide, bornée en longueur", () => {
    expect(createReminderSchema.safeParse({ ...CREATE, note: "" }).success).toBe(false);
    expect(
      createReminderSchema.safeParse({ ...CREATE, note: "x".repeat(REMINDER_NOTE_MAX_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      createReminderSchema.safeParse({ ...CREATE, note: "x".repeat(REMINDER_NOTE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  /**
   * Cible restreinte aux deux gestes offerts par l'UI : `ReminderEntityType` est délibérément plus
   * étroit que `NotificationEntityType`. Sans ce refus, un client pourrait créer un rappel sur une
   * conversation, que rien dans le produit ne sait proposer ni router.
   */
  it("refuse une cible que le produit ne sait pas rappeler", () => {
    expect(createReminderSchema.safeParse({ ...CREATE, entityType: "CONVERSATION" }).success).toBe(
      false,
    );
  });

  // `.strict()` : le tenant n'est jamais transmis par le client — il est injecté par l'extension
  // Prisma. Un `coachId` dans le corps doit donc être un 400, pas un champ ignoré en silence.
  it("refuse un coachId transmis par le client", () => {
    expect(createReminderSchema.safeParse({ ...CREATE, coachId: "usr_1" }).success).toBe(false);
  });
});

describe("updateReminderStatusSchema", () => {
  // Les trois valeurs sont acceptées dans les deux sens : le toggle est réversible (rouvrir un
  // rappel marqué fait par erreur ne doit pas demander d'en recréer un).
  it("accepte les trois statuts, dans les deux sens", () => {
    for (const status of Object.values(ReminderStatus)) {
      expect(updateReminderStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("refuse un statut inconnu", () => {
    expect(updateReminderStatusSchema.safeParse({ status: "SNOOZED" }).success).toBe(false);
  });
});

describe("updateReminderSchema", () => {
  /**
   * PARTIEL, et c'est le point : « repousser » n'envoie qu'une échéance. Exiger la note obligerait
   * chaque raccourci à réémettre un texte qu'il ne modifie pas — et à écraser, au passage, une note
   * corrigée entre-temps dans un autre onglet.
   */
  it("accepte l'échéance seule, la note seule, ou les deux", () => {
    expect(updateReminderSchema.safeParse({ dueAt: "2026-09-01T07:00:00.000Z" }).success).toBe(
      true,
    );
    expect(updateReminderSchema.safeParse({ note: "Relancer plutôt en septembre" }).success).toBe(
      true,
    );
    expect(
      updateReminderSchema.safeParse({ dueAt: "2026-09-01T07:00:00.000Z", note: "Relancer" })
        .success,
    ).toBe(true);
  });

  /**
   * Un corps vide ne demande rien. L'accepter ferait une écriture pour une requête sans intention,
   * donc un `updatedAt` redaté — et l'historique est trié par `updatedAt` décroissant, si bien
   * qu'un rappel traité remonterait en tête sans que rien n'ait changé. Même raison que
   * l'idempotence de `updateStatus`.
   */
  it("refuse un corps vide", () => {
    expect(updateReminderSchema.safeParse({}).success).toBe(false);
  });

  // Mêmes règles que la création : un INSTANT, pas une date civile — sans quoi l'API choisirait un
  // fuseau à la place du client.
  it("refuse une échéance sans heure", () => {
    expect(updateReminderSchema.safeParse({ dueAt: "2026-09-01" }).success).toBe(false);
  });

  /**
   * Aucune contrainte de futur : repousser à hier est licite, le rappel est simplement dû tout de
   * suite. C'est aussi ce qui permet d'AVANCER une échéance — l'issue parle de « repousser », mais
   * rien ne justifie d'interdire l'inverse.
   */
  it("accepte une échéance passée : on peut aussi avancer un rappel", () => {
    expect(updateReminderSchema.safeParse({ dueAt: "2020-01-01T00:00:00.000Z" }).success).toBe(
      true,
    );
  });

  // La note reste le contenu du rappel : la fournir vide l'effacerait. Ne pas la fournir du tout
  // est en revanche le cas normal d'un report.
  it("refuse une note vide, et la borne comme à la création", () => {
    expect(updateReminderSchema.safeParse({ note: "" }).success).toBe(false);
    expect(
      updateReminderSchema.safeParse({ note: "x".repeat(REMINDER_NOTE_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      updateReminderSchema.safeParse({ note: "x".repeat(REMINDER_NOTE_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  /**
   * `.strict()`, avec deux refus qui comptent ici. Le tenant, comme partout : il est injecté, jamais
   * transmis. Et le STATUT : le laisser passer sur cette route ouvrirait un second chemin vers une
   * transition, à côté de `PATCH /reminders/:id/status` — deux façons de faire la même chose, dont
   * une seule est testée.
   */
  it("refuse un coachId ou un statut transmis par le client", () => {
    expect(updateReminderSchema.safeParse({ note: "x", coachId: "usr_1" }).success).toBe(false);
    expect(updateReminderSchema.safeParse({ note: "x", status: "DONE" }).success).toBe(false);
  });

  // `readAt` est décidé par l'API (remis à `null` quand l'échéance bouge, cf. `ReminderService`), il
  // n'est pas un champ que le client pilote — sans quoi « repousser » pourrait éteindre son propre
  // badge.
  it("refuse un readAt transmis par le client", () => {
    expect(updateReminderSchema.safeParse({ dueAt: CREATE.dueAt, readAt: null }).success).toBe(
      false,
    );
  });
});

describe("reminderDtoSchema", () => {
  const DTO = {
    id: "rmd_1",
    entityType: ReminderEntityType.PLAN,
    entityId: "pln_1",
    targetLabel: "Cycle bloc — automne",
    dueAt: "2026-08-15T07:00:00.000Z",
    note: "Relancer le renouvellement du cycle",
    status: ReminderStatus.PENDING,
    readAt: null,
    createdAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:00:00.000Z",
  };

  it("accepte un rappel à traiter, jamais vu dans le centre", () => {
    const result = reminderDtoSchema.safeParse(DTO);
    expect(result.success).toBe(true);
    expect(result.data?.readAt).toBeNull();
  });

  // Cible disparue (pas de FK sur `entityId` — dette N-4) : le rappel reste lisible, sans nom de
  // cible. Le client rend « — » plutôt que d'inventer un libellé.
  it("accepte un rappel dont la cible a disparu", () => {
    expect(reminderDtoSchema.safeParse({ ...DTO, targetLabel: null }).success).toBe(true);
  });

  // La note est le contenu du rappel : le DTO ne la rend jamais nullable, contrairement à
  // `targetLabel`.
  it("refuse un rappel sans note", () => {
    expect(reminderDtoSchema.safeParse({ ...DTO, note: null }).success).toBe(false);
  });
});

describe("reminderSummaryDtoSchema", () => {
  it("accepte un coach sans aucun rappel", () => {
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: 0, pendingCount: 0 }).success).toBe(true);
  });

  /**
   * Un rappel dû EST un rappel à traiter dont l'échéance est passée : les deux nombres s'emboîtent,
   * ils ne s'additionnent pas. Le schéma ne peut pas imposer `dueCount <= pendingCount` (ce serait
   * une règle de service, pas de forme), mais ce test fige l'intention : lire ces deux champs comme
   * deux ensembles disjoints est une erreur.
   */
  it("accepte des rappels dus qui sont un sous-ensemble des rappels à traiter", () => {
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: 2, pendingCount: 5 }).success).toBe(true);
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: 5, pendingCount: 5 }).success).toBe(true);
  });

  // Un compteur ne descend pas sous zéro et ne se fractionne pas : une valeur négative ou décimale
  // trahit un bug de comptage, on la refuse au lieu de l'afficher.
  it("refuse un compteur négatif ou décimal", () => {
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: -1, pendingCount: 0 }).success).toBe(
      false,
    );
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: 1.5, pendingCount: 2 }).success).toBe(
      false,
    );
  });

  // Les deux champs sont requis : une tuile qui reçoit `undefined` afficherait « — » alors que
  // l'API a bien répondu — un silence pris pour une absence de données.
  it("refuse un résumé partiel", () => {
    expect(reminderSummaryDtoSchema.safeParse({ dueCount: 3 }).success).toBe(false);
  });
});

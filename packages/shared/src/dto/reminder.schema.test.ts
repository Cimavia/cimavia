import { describe, expect, it } from "vitest";
import {
  createReminderSchema,
  REMINDER_NOTE_MAX_LENGTH,
  ReminderEntityType,
  ReminderStatus,
  reminderDtoSchema,
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

import { describe, expect, it } from "vitest";
import {
  EMAILABLE_NOTIFICATION_TYPES,
  NOTIFICATION_LABEL_KEY,
  NotificationEntityType,
  NotificationType,
  notificationDtoSchema,
  unreadCountDtoSchema,
  updateNotificationEmailPreferencesSchema,
} from "./notification.schema";

const NOTIFICATION = {
  id: "ntf_1",
  type: NotificationType.FEEDBACK_RECEIVED,
  entityType: NotificationEntityType.SCHEDULED_SESSION,
  entityId: "ss_1",
  actorName: "Léa",
  subjectLabel: "Séance du mardi",
  subjectKey: null,
  readAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
};

describe("notificationDtoSchema", () => {
  it("accepte une notification non lue (readAt null = ce qui alimente le badge)", () => {
    const result = notificationDtoSchema.safeParse(NOTIFICATION);
    expect(result.success).toBe(true);
    expect(result.data?.readAt).toBeNull();
  });

  // Une facture émise n'a ni acteur ni sujet à nommer : les deux paramètres sont nullables, et le
  // client rend alors une formule générique plutôt qu'un trou.
  it("accepte une notification sans acteur ni sujet", () => {
    const result = notificationDtoSchema.safeParse({
      ...NOTIFICATION,
      type: NotificationType.INVOICE_ISSUED,
      entityType: NotificationEntityType.INVOICE,
      actorName: null,
      subjectLabel: null,
      readAt: "2026-08-05T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  // Une app plus ancienne que l'API ne doit pas parser un type qu'elle ne sait pas rendre : le
  // refus est explicite plutôt qu'un libellé vide à l'écran. (Ce test visait `REMINDER_DUE` avant
  // que #51 ne l'ajoute — d'où un type resté hors du produit.)
  it("refuse un type ou une entité inconnus", () => {
    expect(
      notificationDtoSchema.safeParse({ ...NOTIFICATION, type: "PLAN_ARCHIVED" }).success,
    ).toBe(false);
    expect(
      notificationDtoSchema.safeParse({ ...NOTIFICATION, entityType: "EXERCISE" }).success,
    ).toBe(false);
  });

  /**
   * Un rappel dû (#51) est une entrée de flux CALCULÉE, pas une ligne de la table : son id porte le
   * préfixe `reminder:`. Le DTO doit donc l'accepter — `id` est un id d'entrée de flux, pas un cuid.
   */
  it("accepte une entrée de rappel dû, dont l'id est préfixé", () => {
    const result = notificationDtoSchema.safeParse({
      ...NOTIFICATION,
      id: "reminder:rmd_1",
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.INVOICE,
      actorName: null,
      subjectLabel: "Relancer le renouvellement",
    });
    expect(result.success).toBe(true);
  });

  /**
   * Un rappel AUTO-GÉNÉRÉ (#47) n'a pas de note : son sujet voyage comme **clé i18n**
   * (`subjectKey`), jamais comme libellé rendu. C'est la même règle que `NOTIFICATION_LABEL_KEY`
   * appliquée au paramètre plutôt qu'à la phrase — sans quoi « le cycle se termine » partirait figé
   * en français dans une charge utile d'API.
   */
  it("accepte une entrée dont le sujet est une clé et non une valeur", () => {
    const result = notificationDtoSchema.safeParse({
      ...NOTIFICATION,
      id: "reminder:rmd_2",
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.PLAN,
      actorName: null,
      subjectLabel: null,
      subjectKey: "reminder.reason.planEnding",
    });
    expect(result.success).toBe(true);
  });

  // Les deux champs sont requis, même à `null` : un client qui reçoit `undefined` ne saurait pas
  // distinguer « pas de sujet » d'un champ que l'API a oublié d'envoyer.
  it("refuse une notification sans subjectKey", () => {
    const { subjectKey: _omitted, ...withoutKey } = NOTIFICATION;
    expect(notificationDtoSchema.safeParse(withoutKey).success).toBe(false);
  });

  it("refuse un horodatage qui n'est pas une date ISO", () => {
    expect(notificationDtoSchema.safeParse({ ...NOTIFICATION, createdAt: "hier" }).success).toBe(
      false,
    );
  });
});

describe("unreadCountDtoSchema", () => {
  const EMPTY = { count: 0, coach: 0, athlete: 0 };

  it("refuse un compteur négatif ou fractionnaire", () => {
    expect(unreadCountDtoSchema.safeParse(EMPTY).success).toBe(true);
    expect(unreadCountDtoSchema.safeParse({ ...EMPTY, count: -1 }).success).toBe(false);
    expect(unreadCountDtoSchema.safeParse({ ...EMPTY, count: 1.5 }).success).toBe(false);
    expect(unreadCountDtoSchema.safeParse({ ...EMPTY, coach: -1 }).success).toBe(false);
  });

  /**
   * La ventilation par espace est REQUISE (#176) : un client qui recevrait un compteur sans elle
   * afficherait une pastille vide sur l'espace inactif, c'est-à-dire « rien ne t'attend ailleurs »
   * — exactement le mensonge que cette ventilation existe pour éviter.
   */
  it("exige la ventilation, pas seulement le total", () => {
    expect(unreadCountDtoSchema.safeParse({ count: 3 }).success).toBe(false);
  });

  /**
   * `coach + athlete` peut être INFÉRIEUR au total : un type dont le titre est indécidable compte
   * dans le total sans se ranger d'un côté. Le schéma ne l'interdit donc pas.
   */
  it("accepte un total supérieur à la somme des deux espaces", () => {
    expect(unreadCountDtoSchema.safeParse({ count: 5, coach: 2, athlete: 1 }).success).toBe(true);
  });
});

describe("NOTIFICATION_LABEL_KEY", () => {
  /**
   * Le `satisfies Record<NotificationType, string>` garantit qu'aucun type ne manque, PAS que deux
   * types ne partagent la même clé — un copier-coller entre deux lignes voisines passerait le
   * typecheck et donnerait deux notifications au libellé identique.
   */
  it("donne une clé distincte à chaque type", () => {
    const keys = Object.values(NOTIFICATION_LABEL_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(Object.keys(NotificationType).length);
  });
});

describe("notifications par e-mail — le sous-ensemble envoyable", () => {
  /**
   * La frontière du sous-ensemble EST la décision de #65, et elle se défait sans bruit : ajouter
   * un type à la liste suffirait à mettre trois e-mails dans une boîte pour trois séances
   * ajoutées au même cycle (dette N-6, aucun groupement). Ce test la fige, pour qu'un
   * élargissement soit un geste délibéré et non un effet de bord.
   */
  it("exclut les trois ajustements de cycle, qui arrivent par rafales", () => {
    expect(EMAILABLE_NOTIFICATION_TYPES).not.toContain(NotificationType.PLAN_UPDATED);
    expect(EMAILABLE_NOTIFICATION_TYPES).not.toContain(NotificationType.PLAN_SESSION_ADDED);
    expect(EMAILABLE_NOTIFICATION_TYPES).not.toContain(NotificationType.PLAN_SESSION_REMOVED);
  });

  // `REMINDER_DUE` n'est jamais persisté et ne passe pas par le point d'émission commun : il ne
  // pourrait pas partir par e-mail même si quelqu'un l'activait.
  it("exclut le rappel dû, qui ne passe pas par le point d'émission", () => {
    expect(EMAILABLE_NOTIFICATION_TYPES).not.toContain(NotificationType.REMINDER_DUE);
  });

  it("porte les quatre types que le produit a retenus", () => {
    expect([...EMAILABLE_NOTIFICATION_TYPES]).toEqual([
      NotificationType.PLAN_PUBLISHED,
      NotificationType.FEEDBACK_RECEIVED,
      NotificationType.MESSAGE_RECEIVED,
      NotificationType.INVOICE_ISSUED,
    ]);
  });
});

describe("updateNotificationEmailPreferencesSchema", () => {
  // Le défaut du produit : rien n'est envoyé tant que rien n'est demandé. Une liste vide est donc
  // une valeur légitime, et non une saisie incomplète à refuser.
  it("accepte une liste vide — c'est le réglage par défaut", () => {
    const result = updateNotificationEmailPreferencesSchema.safeParse({ enabled: [] });
    expect(result.success).toBe(true);
  });

  /**
   * Le refus est porté par le SCHÉMA, pas par une garde dans le service : un type hors du
   * sous-ensemble part en 400 avant d'atteindre la moindre écriture. Sans quoi la colonne Prisma,
   * qui porte l'enum complet, accepterait une préférence qu'aucun gabarit ne sait rendre.
   */
  it("refuse un type que le produit n'envoie pas par e-mail", () => {
    const result = updateNotificationEmailPreferencesSchema.safeParse({
      enabled: [NotificationType.PLAN_SESSION_ADDED],
    });
    expect(result.success).toBe(false);
  });

  it("accepte les quatre types envoyables", () => {
    const result = updateNotificationEmailPreferencesSchema.safeParse({
      enabled: [...EMAILABLE_NOTIFICATION_TYPES],
    });
    expect(result.success).toBe(true);
  });
});

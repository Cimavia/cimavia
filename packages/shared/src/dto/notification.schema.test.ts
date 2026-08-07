import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_LABEL_KEY,
  NotificationEntityType,
  NotificationType,
  notificationDtoSchema,
  unreadCountDtoSchema,
} from "./notification.schema";

const NOTIFICATION = {
  id: "ntf_1",
  type: NotificationType.FEEDBACK_RECEIVED,
  entityType: NotificationEntityType.SCHEDULED_SESSION,
  entityId: "ss_1",
  actorName: "Léa",
  subjectLabel: "Séance du mardi",
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
  // refus est explicite plutôt qu'un libellé vide à l'écran.
  it("refuse un type ou une entité inconnus", () => {
    expect(notificationDtoSchema.safeParse({ ...NOTIFICATION, type: "REMINDER_DUE" }).success).toBe(
      false,
    );
    expect(
      notificationDtoSchema.safeParse({ ...NOTIFICATION, entityType: "EXERCISE" }).success,
    ).toBe(false);
  });

  it("refuse un horodatage qui n'est pas une date ISO", () => {
    expect(notificationDtoSchema.safeParse({ ...NOTIFICATION, createdAt: "hier" }).success).toBe(
      false,
    );
  });
});

describe("unreadCountDtoSchema", () => {
  it("refuse un compteur négatif ou fractionnaire", () => {
    expect(unreadCountDtoSchema.safeParse({ count: 0 }).success).toBe(true);
    expect(unreadCountDtoSchema.safeParse({ count: -1 }).success).toBe(false);
    expect(unreadCountDtoSchema.safeParse({ count: 1.5 }).success).toBe(false);
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

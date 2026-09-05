import { describe, expect, it } from "vitest";
import { NotificationType } from "../dto/notification.schema";
import { capabilityOfMessage, capabilityOfNotification } from "./notification.util";

describe("capabilityOfNotification", () => {
  /**
   * Le titre se déduit du TYPE parce qu'il détermine de quel côté de la relation on se trouve :
   * on reçoit un cycle diffusé parce qu'on s'entraîne dessus, un débrief parce qu'on coache.
   */
  it("range côté athlète tout ce qui concerne son entraînement", () => {
    for (const type of [
      NotificationType.PLAN_PUBLISHED,
      NotificationType.PLAN_UPDATED,
      NotificationType.PLAN_SESSION_ADDED,
      NotificationType.PLAN_SESSION_REMOVED,
      NotificationType.INVOICE_ISSUED,
    ]) {
      expect(capabilityOfNotification(type)).toBe("athlete");
    }
  });

  it("range côté coach le débrief reçu et le rappel dû", () => {
    expect(capabilityOfNotification(NotificationType.FEEDBACK_RECEIVED)).toBe("coach");
    expect(capabilityOfNotification(NotificationType.REMINDER_DUE)).toBe("coach");
  });

  /**
   * Les trois temps d'une invitation (#146) se partagent entre les deux espaces, et c'est ce que
   * ce test fige : l'invitation elle-même est reçue en athlète (c'est la capacité qu'elle propose
   * d'exercer), les deux réponses en coach (c'est lui qui l'a émise). Les ranger tous du même côté
   * ferait clignoter la pastille de l'espace où il n'y a rien à faire.
   */
  it("sépare l'invitation reçue de ses deux réponses", () => {
    expect(capabilityOfNotification(NotificationType.INVITATION_RECEIVED)).toBe("athlete");
    expect(capabilityOfNotification(NotificationType.INVITATION_ACCEPTED)).toBe("coach");
    expect(capabilityOfNotification(NotificationType.INVITATION_DECLINED)).toBe("coach");
  });

  /**
   * Le message est le seul type indécidable : les deux côtés d'un fil en reçoivent. Rendre « coach »
   * par défaut rangerait la moitié des messages du mauvais côté — mieux vaut ne pas répondre et
   * laisser l'appelant résoudre depuis la conversation.
   */
  it("ne tranche pas pour un message", () => {
    expect(capabilityOfNotification(NotificationType.MESSAGE_RECEIVED)).toBeNull();
  });

  // Fail closed : un type inconnu (API plus récente que ce client) ne se range nulle part plutôt
  // que d'être compté du mauvais côté.
  it("ne range nulle part un type qu'elle ne connaît pas", () => {
    expect(capabilityOfNotification("SOMETHING_NEW" as NotificationType)).toBeNull();
  });
});

describe("capabilityOfMessage", () => {
  it("déduit le titre du côté que l'on occupe dans le fil", () => {
    const thread = { coachId: "u_coach", athleteId: "u_athlete" };
    expect(capabilityOfMessage("u_coach", thread)).toBe("coach");
    expect(capabilityOfMessage("u_athlete", thread)).toBe("athlete");
  });
});

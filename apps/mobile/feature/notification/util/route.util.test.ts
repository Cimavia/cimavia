import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { routeForNotification, routeForPushPayload } from "./route.util";

const COACH: Capabilities = { isCoach: true, isAthlete: false };
const ATHLETE: Capabilities = { isCoach: false, isAthlete: true };

const entry = (over: Partial<NotificationDto> = {}): NotificationDto =>
  ({
    id: "n-1",
    type: NotificationType.PLAN_PUBLISHED,
    entityType: NotificationEntityType.PLAN,
    entityId: "e-1",
    actorName: null,
    subjectLabel: null,
    subjectKey: null,
    readAt: null,
    createdAt: "2026-08-15T09:00:00.000Z",
    ...over,
  }) as NotificationDto;

describe("routeForNotification — côté coach", () => {
  /**
   * `PLAN` reste `null` DÉFINITIVEMENT pour un coach : le builder est web-only (#20), il n'y a pas
   * d'écran mobile à viser. Le centre marque alors lu et rafraîchit sans naviguer — « il s'est
   * passé quelque chose », sans mentir sur l'endroit.
   */
  it("ne mène nulle part sur un cycle : le builder est web-only", () => {
    expect(routeForNotification(entry(), COACH)).toBeNull();
  });

  it("ouvre LE débrief reçu, pas la liste", () => {
    const dto = entry({ entityType: NotificationEntityType.SCHEDULED_SESSION, entityId: "s-9" });
    expect(routeForNotification(dto, COACH)).toBe("/feedbacks/s-9");
  });

  /**
   * La LISTE des fils, pas un fil précis : `entityId` porte l'id de la conversation, alors que la
   * route coach attend celui de l'athlète. Y passer l'un pour l'autre ouvrirait le mauvais fil.
   */
  it("ouvre la liste des fils et non un fil précis", () => {
    expect(
      routeForNotification(entry({ entityType: NotificationEntityType.CONVERSATION }), COACH),
    ).toBe("/messages");
  });

  it("mène aux factures", () => {
    expect(routeForNotification(entry({ entityType: NotificationEntityType.INVOICE }), COACH)).toBe(
      "/invoices",
    );
  });
});

describe("routeForNotification — côté athlète", () => {
  it.each([
    [NotificationEntityType.PLAN, "/planning"],
    [NotificationEntityType.CONVERSATION, "/messages"],
    [NotificationEntityType.INVOICE, "/invoices"],
  ])("mène %s vers %s", (entityType, expected) => {
    expect(routeForNotification(entry({ entityType }), ATHLETE)).toBe(expected);
  });

  it("ouvre SA séance, pas la liste des débriefs du coach", () => {
    const dto = entry({ entityType: NotificationEntityType.SCHEDULED_SESSION, entityId: "s-9" });
    expect(routeForNotification(dto, ATHLETE)).toBe("/session/s-9");
  });
});

describe("routeForNotification — repli des rappels dus", () => {
  /**
   * Le repli COMBLE une absence, il ne remplace pas une destination. Un rappel dû sur un CYCLE
   * était un cul-de-sac (`PLAN` rend `null` côté coach) ; il mène désormais à « Mes rappels », où
   * vivent les gestes.
   */
  it("rattrape le cul-de-sac d'un rappel dû sur un cycle", () => {
    const dto = entry({ type: NotificationType.REMINDER_DUE });
    expect(routeForNotification(dto, COACH)).toBe("/reminders");
  });

  it("ne détourne PAS un rappel dû dont la cible mène déjà quelque part", () => {
    const dto = entry({
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.INVOICE,
    });
    expect(routeForNotification(dto, COACH)).toBe("/invoices");
  });

  /**
   * L'écran des rappels est gardé par capacité, et un athlète n'en a aucun : le repli ne doit pas
   * détourner sa notification. Il part donc sur la destination normale de la cible.
   *
   * À noter : pour un DTO bien formé, la branche « athlète » du repli est **inatteignable** —
   * `entityId` n'est jamais nul côté centre, donc `targetFor` résout toujours pour un athlète.
   * C'est une garde, pas un chemin vivant ; on ne feint pas de la couvrir par un cast.
   */
  it("ne détourne jamais un athlète vers les rappels", () => {
    const dto = entry({
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.PLAN,
    });
    expect(routeForNotification(dto, ATHLETE)).toBe("/planning");
  });
});

describe("routeForPushPayload", () => {
  /**
   * Les DEUX portes d'entrée doivent dire la même chose : ouvrir le push et toucher la ligne du
   * centre. Les faire diverger, c'est garantir qu'un jour l'une navigue et l'autre non.
   */
  it.each([
    [NotificationType.PLAN_PUBLISHED, { planId: "p-1" }, NotificationEntityType.PLAN, "p-1"],
    [NotificationType.PLAN_UPDATED, { planId: "p-1" }, NotificationEntityType.PLAN, "p-1"],
    [NotificationType.PLAN_SESSION_ADDED, { planId: "p-1" }, NotificationEntityType.PLAN, "p-1"],
    [NotificationType.PLAN_SESSION_REMOVED, { planId: "p-1" }, NotificationEntityType.PLAN, "p-1"],
    [
      NotificationType.FEEDBACK_RECEIVED,
      { scheduledSessionId: "s-1" },
      NotificationEntityType.SCHEDULED_SESSION,
      "s-1",
    ],
    [
      NotificationType.MESSAGE_RECEIVED,
      { conversationId: "c-1" },
      NotificationEntityType.CONVERSATION,
      "c-1",
    ],
    [NotificationType.INVOICE_ISSUED, { invoiceId: "i-1" }, NotificationEntityType.INVOICE, "i-1"],
  ])("mène %s au même endroit que la ligne du centre", (type, ids, entityType, entityId) => {
    for (const capabilities of [COACH, ATHLETE]) {
      expect(routeForPushPayload({ type, ...ids }, capabilities)).toBe(
        routeForNotification(entry({ type, entityType, entityId }), capabilities),
      );
    }
  });

  it("mène un rappel dû aux rappels du coach, sans lire la cible", () => {
    expect(
      routeForPushPayload({ type: NotificationType.REMINDER_DUE, reminderId: "r-1" }, COACH),
    ).toBe("/reminders");
    expect(
      routeForPushPayload({ type: NotificationType.REMINDER_DUE, reminderId: "r-1" }, ATHLETE),
    ).toBeNull();
  });

  /**
   * Une charge utile abîmée ou plus récente que l'app ne doit pas faire deviner : `null`, et le
   * push ouvre l'app sans naviguer.
   */
  it.each([
    ["un type inconnu", { type: "TYPE_DU_FUTUR" }],
    ["une charge sans type", { planId: "p-1" }],
    ["null", null],
    ["une chaîne", "pas un objet"],
  ])("rend null sur %s", (_cas, payload) => {
    expect(routeForPushPayload(payload, COACH)).toBeNull();
  });

  // L'id manquant est le cas réel d'une charge tronquée : mieux vaut ne pas naviguer que viser
  // « /session/undefined ».
  it("rend null quand l'id attendu manque de la charge utile", () => {
    expect(routeForPushPayload({ type: NotificationType.FEEDBACK_RECEIVED }, COACH)).toBeNull();
    expect(routeForPushPayload({ type: NotificationType.FEEDBACK_RECEIVED }, ATHLETE)).toBeNull();
  });
});

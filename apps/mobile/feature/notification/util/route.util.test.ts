import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
  type TrainingCapability,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { routeForNotification, routeForPushPayload } from "./route.util";

const COACH: Capabilities = { isCoach: true, isAthlete: false, isCompany: false };
const ATHLETE: Capabilities = { isCoach: false, isAthlete: true, isCompany: false };
const BOTH: Capabilities = { isCoach: true, isAthlete: true, isCompany: false };

/** Le titre exercé d'un compte mono-capacité : le seul qu'il ait. */
const soleTitle = (capabilities: Capabilities): TrainingCapability =>
  capabilities.isCoach ? "coach" : "athlete";

/** L'écran visé seul, pour les cas où le titre n'est pas la question. */
const hrefOf = (
  notification: NotificationDto,
  capabilities: Capabilities,
  acting = soleTitle(capabilities),
) => routeForNotification(notification, capabilities, acting)?.href ?? null;

const pushHrefOf = (data: unknown, capabilities: Capabilities, acting = soleTitle(capabilities)) =>
  routeForPushPayload(data, capabilities, acting)?.href ?? null;

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
    expect(hrefOf(entry(), COACH)).toBeNull();
  });

  it("ouvre LE débrief reçu, pas la liste", () => {
    const dto = entry({
      type: NotificationType.FEEDBACK_RECEIVED,
      entityType: NotificationEntityType.SCHEDULED_SESSION,
      entityId: "s-9",
    });
    expect(hrefOf(dto, COACH)).toBe("/feedbacks/s-9");
  });

  /**
   * La liste des fils, avec le fil à ouvrir : `entityId` porte l'id de la conversation, alors que
   * la route d'un fil attend l'interlocuteur. Y passer l'un pour l'autre ouvrirait le mauvais fil —
   * c'est donc la liste qui traduit (#599).
   */
  it("ouvre la liste en lui confiant le fil notifié", () => {
    const dto = entry({
      type: NotificationType.MESSAGE_RECEIVED,
      entityType: NotificationEntityType.CONVERSATION,
    });
    expect(hrefOf(dto, COACH)).toBe("/messages?conversation=e-1");
  });

  // Un coach ne reçoit une facture qu'à travers un rappel dû (une impayée) : la facture garde sa
  // destination, le repli des rappels ne la détourne pas.
  it("mène aux factures", () => {
    const dto = entry({
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.INVOICE,
    });
    expect(hrefOf(dto, COACH)).toBe("/invoices");
  });
});

describe("routeForNotification — côté athlète", () => {
  it.each([
    [NotificationEntityType.PLAN, "/planning"],
    // Le fil notifié, et non « le » fil : l'athlète en a un par coach (#599).
    [NotificationEntityType.CONVERSATION, "/messages?conversation=e-1"],
    [NotificationEntityType.INVOICE, "/invoices"],
  ])("mène %s vers %s", (entityType, expected) => {
    expect(hrefOf(entry({ entityType }), ATHLETE)).toBe(expected);
  });

  it("ouvre SA séance, pas la liste des débriefs du coach", () => {
    const dto = entry({ entityType: NotificationEntityType.SCHEDULED_SESSION, entityId: "s-9" });
    expect(hrefOf(dto, ATHLETE)).toBe("/session/s-9");
  });

  // Une app plus ancienne que l'API reçoit un type d'entité qu'elle ne connaît pas : elle ne
  // devine pas de destination (#512 — le `default` est vivant, pas mort).
  it("ne mène nulle part sur un type d'entité inconnu", () => {
    const dto = entry({ entityType: "TYPE_DU_FUTUR" as NotificationEntityType });
    expect(hrefOf(dto, ATHLETE)).toBeNull();
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
    expect(hrefOf(dto, COACH)).toBe("/reminders");
  });

  it("ne détourne PAS un rappel dû dont la cible mène déjà quelque part", () => {
    const dto = entry({
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.INVOICE,
    });
    expect(hrefOf(dto, COACH)).toBe("/invoices");
  });

  /**
   * L'écran des rappels est gardé par capacité. Un rappel se reçoit en coach : le compte qui ne
   * l'est plus (capacité retirée depuis) n'a aucun écran pour le lire, et n'est envoyé nulle part
   * plutôt que vers un 403 (#344).
   */
  it("n'ouvre rien d'un rappel à qui n'est plus coach", () => {
    const dto = entry({
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.PLAN,
    });
    expect(hrefOf(dto, ATHLETE)).toBeNull();
  });
});

/**
 * Un compte coach ET athlète (#344). Son centre n'est pas filtré par espace : il y lit, mêlées, les
 * notifications de ses deux côtés. Chacune mène là où son TYPE dit qu'elle se lit, quel que soit
 * le titre qu'il exerce — et emporte ce titre, pour que l'appelant bascule le sélecteur.
 */
describe("routeForNotification — compte à double capacité", () => {
  it.each(["coach", "athlete"] as const)(
    "ouvre un cycle diffusé sur le planning, en titre %s",
    (acting) => {
      expect(routeForNotification(entry(), BOTH, acting)).toEqual({
        href: "/planning",
        capability: "athlete",
      });
    },
  );

  it.each(["coach", "athlete"] as const)(
    "ouvre une invitation reçue sur l'écran où elle s'accepte, en titre %s",
    (acting) => {
      const dto = entry({
        type: NotificationType.INVITATION_RECEIVED,
        entityType: NotificationEntityType.INVITATION,
        entityId: "inv-1",
      });
      expect(routeForNotification(dto, BOTH, acting)).toEqual({
        href: "/join",
        capability: "athlete",
      });
    },
  );

  // Le piège du titre exercé : sous lui, le débrief irait à `/session/:id`, une route d'athlète
  // qui ne lit pas la séance de SON athlète.
  it("ouvre un débrief reçu en coach, même en titre athlète", () => {
    const dto = entry({
      type: NotificationType.FEEDBACK_RECEIVED,
      entityType: NotificationEntityType.SCHEDULED_SESSION,
      entityId: "s-9",
    });
    expect(routeForNotification(dto, BOTH, "athlete")).toEqual({
      href: "/feedbacks/s-9",
      capability: "coach",
    });
  });

  // Factures sert les deux titres : c'est le titre emporté qui y montrera la bonne.
  it("ouvre une facture émise en athlète, même en titre coach", () => {
    const dto = entry({
      type: NotificationType.INVOICE_ISSUED,
      entityType: NotificationEntityType.INVOICE,
    });
    expect(routeForNotification(dto, BOTH, "coach")).toEqual({
      href: "/invoices",
      capability: "athlete",
    });
  });

  // Les deux côtés d'un fil reçoivent un message : seul le titre exercé départage.
  it("garde le titre exercé pour un message", () => {
    const dto = entry({
      type: NotificationType.MESSAGE_RECEIVED,
      entityType: NotificationEntityType.CONVERSATION,
    });
    expect(routeForNotification(dto, BOTH, "athlete")).toEqual({
      href: "/messages?conversation=e-1",
      capability: "athlete",
    });
  });
});

describe("routeForNotification — l'invitation (#146)", () => {
  /**
   * Branchée par TITRE, comme le reste de la table : le coach à qui l'on a répondu revient à son
   * tableau de bord, où le nouvel athlète apparaît ; l'athlète invité va à l'écran où l'invitation
   * s'accepte.
   */
  it("mène le coach au tableau de bord et l'athlète à l'écran de rattachement", () => {
    const invitation = { entityType: NotificationEntityType.INVITATION, entityId: "inv-1" };
    const accepted = entry({ type: NotificationType.INVITATION_ACCEPTED, ...invitation });
    const received = entry({ type: NotificationType.INVITATION_RECEIVED, ...invitation });
    expect(hrefOf(accepted, COACH)).toBe("/dashboard");
    expect(hrefOf(received, ATHLETE)).toBe("/join");
  });

  // L'invitation d'une entreprise (#601) ne vise que des Coachs : sa carte attend sur leur accueil.
  it("mène le coach invité par une entreprise à la carte de son tableau de bord", () => {
    const dto = entry({
      type: NotificationType.ORGANIZATION_INVITATION_RECEIVED,
      entityType: NotificationEntityType.INVITATION,
      entityId: "inv-2",
    });
    expect(hrefOf(dto, COACH)).toBe("/dashboard");
  });

  /**
   * Le seul type dont la destination est SUPPRIMÉE plutôt que déduite — l'exact inverse du repli
   * des rappels dus, qui en COMBLE une absente. L'écran existe pourtant : c'est que l'ENTITÉ est
   * morte, l'invitation refusée ayant quitté `PENDING`.
   */
  it("ne mène nulle part quand l'invitation a été refusée, cloche comme push", () => {
    const dto = entry({
      type: NotificationType.INVITATION_DECLINED,
      entityType: NotificationEntityType.INVITATION,
      entityId: "inv-2",
    });
    expect(hrefOf(dto, COACH)).toBeNull();
    expect(hrefOf(dto, ATHLETE)).toBeNull();
    expect(
      pushHrefOf({ type: NotificationType.INVITATION_DECLINED, invitationId: "inv-2" }, COACH),
    ).toBeNull();
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
      NotificationType.PLAN_SESSIONS_REORDERED,
      { planId: "p-1" },
      NotificationEntityType.PLAN,
      "p-1",
    ],
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
    /**
     * Les deux invitations qui MÈNENT quelque part (#146). Leur clé d'id est `invitationId`, et le
     * typecheck ne l'aurait pas réclamée : la charge utile est `unknown`, un type oublié tomberait
     * dans le `default` et le push ne mènerait nulle part là où la cloche mène quelque part.
     */
    [
      NotificationType.INVITATION_RECEIVED,
      { invitationId: "inv-1" },
      NotificationEntityType.INVITATION,
      "inv-1",
    ],
    [
      NotificationType.INVITATION_ACCEPTED,
      { invitationId: "inv-1" },
      NotificationEntityType.INVITATION,
      "inv-1",
    ],
    [
      NotificationType.ORGANIZATION_INVITATION_RECEIVED,
      { invitationId: "inv-2" },
      NotificationEntityType.INVITATION,
      "inv-2",
    ],
    [
      NotificationType.ORGANIZATION_COACH_JOINED,
      { invitationId: "inv-3" },
      NotificationEntityType.INVITATION,
      "inv-3",
    ],
  ])("mène %s au même endroit que la ligne du centre", (type, ids, entityType, entityId) => {
    // L'écran ET le titre, sous chaque titre exercé d'un compte qui cumule aussi (#344).
    const accounts: [Capabilities, TrainingCapability][] = [
      [COACH, "coach"],
      [ATHLETE, "athlete"],
      [BOTH, "coach"],
      [BOTH, "athlete"],
    ];
    for (const [capabilities, acting] of accounts) {
      expect(routeForPushPayload({ type, ...ids }, capabilities, acting)).toEqual(
        routeForNotification(entry({ type, entityType, entityId }), capabilities, acting),
      );
    }
  });

  it("mène un rappel dû aux rappels du coach, sans lire la cible", () => {
    expect(pushHrefOf({ type: NotificationType.REMINDER_DUE, reminderId: "r-1" }, COACH)).toBe(
      "/reminders",
    );
    expect(
      pushHrefOf({ type: NotificationType.REMINDER_DUE, reminderId: "r-1" }, ATHLETE),
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
    expect(pushHrefOf(payload, COACH)).toBeNull();
  });

  // L'id manquant est le cas réel d'une charge tronquée : mieux vaut ne pas naviguer que viser
  // « /session/undefined ».
  it("rend null quand l'id attendu manque de la charge utile", () => {
    expect(pushHrefOf({ type: NotificationType.FEEDBACK_RECEIVED }, COACH)).toBeNull();
    expect(pushHrefOf({ type: NotificationType.FEEDBACK_RECEIVED }, ATHLETE)).toBeNull();
  });

  // Un message sans fil connu ouvre quand même la messagerie : la liste vaut mieux que rien.
  it("ouvre la liste quand le fil manque de la charge utile", () => {
    for (const capabilities of [COACH, ATHLETE]) {
      expect(pushHrefOf({ type: NotificationType.MESSAGE_RECEIVED }, capabilities)).toBe(
        "/messages",
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import { NotificationCategory, NotificationType } from "../dto/notification.schema";
import {
  capabilityOfMessage,
  capabilityOfNotification,
  notificationCategoriesFor,
  notificationFilterChoices,
  notificationOpeningCapability,
  notificationSubject,
  notificationTypesOf,
} from "./notification.util";

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
      NotificationType.PLAN_SESSIONS_REORDERED,
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

  // Le Coach qui rejoint une entreprise (#602) s'annonce à ses athlètes, dans leur espace.
  it("range l'arrivée d'un Coach d'entreprise côté athlète", () => {
    expect(capabilityOfNotification(NotificationType.ORGANIZATION_COACH_JOINED)).toBe("athlete");
  });

  // Une entreprise n'invite que des Coachs (#601) : l'invitation se range dans leur espace.
  it("range l'invitation d'une entreprise côté Coach", () => {
    expect(capabilityOfNotification(NotificationType.ORGANIZATION_INVITATION_RECEIVED)).toBe(
      "coach",
    );
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

describe("notificationOpeningCapability", () => {
  const BOTH = { isCoach: true, isAthlete: true, isCompany: false };
  const ATHLETE_ONLY = { isCoach: false, isAthlete: true, isCompany: false };

  /**
   * Le centre liste tout ce que le compte a reçu, des deux côtés : c'est le TYPE qui dit sous quel
   * titre l'ouvrir, quel que soit celui qu'on exerce. Le contraire enverrait un débrief, ouvert en
   * titre athlète, vers une route d'athlète.
   */
  it("ouvre sous le titre de la notification, pas sous celui qu'on exerce", () => {
    expect(notificationOpeningCapability(NotificationType.PLAN_PUBLISHED, BOTH, "coach")).toBe(
      "athlete",
    );
    expect(notificationOpeningCapability(NotificationType.FEEDBACK_RECEIVED, BOTH, "athlete")).toBe(
      "coach",
    );
  });

  // Les deux côtés d'un fil reçoivent un message : seul le titre exercé départage.
  it("s'en remet au titre exercé pour un message", () => {
    expect(notificationOpeningCapability(NotificationType.MESSAGE_RECEIVED, BOTH, "athlete")).toBe(
      "athlete",
    );
    expect(notificationOpeningCapability(NotificationType.MESSAGE_RECEIVED, BOTH, "coach")).toBe(
      "coach",
    );
  });

  // Fail closed : un client ne devine pas le titre d'un type que l'API a ajouté après lui.
  it("n'ouvre rien d'un type qu'elle ne connaît pas", () => {
    expect(
      notificationOpeningCapability("SOMETHING_NEW" as NotificationType, BOTH, "coach"),
    ).toBeNull();
  });

  // Un Coach qui a cessé de coacher relit un vieux débrief : aucun de ses écrans ne le montre.
  it("n'ouvre rien sous une capacité que le compte n'a plus", () => {
    expect(
      notificationOpeningCapability(NotificationType.FEEDBACK_RECEIVED, ATHLETE_ONLY, "athlete"),
    ).toBeNull();
  });
});

describe("capabilityOfMessage", () => {
  it("déduit le titre du côté que l'on occupe dans le fil", () => {
    const thread = { coachId: "u_coach", athleteId: "u_athlete" };
    expect(capabilityOfMessage("u_coach", thread)).toBe("coach");
    expect(capabilityOfMessage("u_athlete", thread)).toBe("athlete");
  });
});

describe("notificationSubject", () => {
  const translate = (key: string) => `traduit:${key}`;
  const formatFullDay = (isoDate: string) => `jour:${isoDate}`;

  const notification = (over: Partial<Parameters<typeof notificationSubject>[0]> = {}) => ({
    type: NotificationType.PLAN_UPDATED,
    subjectLabel: null,
    subjectKey: null,
    ...over,
  });

  it("traduit un intitulé système avant tout le reste", () => {
    const subject = notificationSubject(
      notification({ subjectKey: "reminder.reason.invoice", subjectLabel: "ignoré" }),
      translate,
      formatFullDay,
    );

    expect(subject).toBe("traduit:reminder.reason.invoice");
  });

  it("rend telle quelle la valeur écrite par un utilisateur", () => {
    const subject = notificationSubject(
      notification({ subjectLabel: "Bloc force" }),
      translate,
      formatFullDay,
    );

    expect(subject).toBe("Bloc force");
  });

  /**
   * Le jour réordonné (#148) est persisté en date ISO, pas en toutes lettres : l'API ne fabrique
   * jamais de libellé, sinon la ligne resterait française le jour où `en.json` arrive.
   */
  it("met en forme la date d'une journée réordonnée", () => {
    const subject = notificationSubject(
      notification({ type: NotificationType.PLAN_SESSIONS_REORDERED, subjectLabel: "2026-09-07" }),
      translate,
      formatFullDay,
    );

    expect(subject).toBe("jour:2026-09-07");
  });

  // `null` et non une chaîne vide, qui laisserait un trou dans la phrase : c'est au client
  // d'afficher « — ».
  it("ne nomme rien quand l'événement n'a pas de sujet", () => {
    expect(notificationSubject(notification(), translate, formatFullDay)).toBeNull();
    expect(
      notificationSubject(
        notification({ type: NotificationType.PLAN_SESSIONS_REORDERED }),
        translate,
        formatFullDay,
      ),
    ).toBeNull();
  });
});

describe("notificationTypesOf", () => {
  it("rend les types d'une catégorie, dans l'ordre de l'enum", () => {
    expect(notificationTypesOf(NotificationCategory.PLANNING)).toEqual([
      NotificationType.PLAN_PUBLISHED,
      NotificationType.PLAN_UPDATED,
      NotificationType.PLAN_SESSION_ADDED,
      NotificationType.PLAN_SESSION_REMOVED,
      NotificationType.PLAN_SESSIONS_REORDERED,
    ]);
    expect(notificationTypesOf(NotificationCategory.REMINDER)).toEqual([
      NotificationType.REMINDER_DUE,
    ]);
  });

  // Les catégories se partagent l'enum sans recouvrement : un type filtré n'apparaît qu'une fois.
  it("partitionne l'enum", () => {
    const all = Object.values(NotificationCategory).flatMap(notificationTypesOf);
    expect(all.sort()).toEqual(Object.values(NotificationType).sort());
  });
});

describe("notificationCategoriesFor", () => {
  const NONE = { isCoach: false, isAthlete: false, isCompany: false };

  it("n'offre à un athlète seul ni les débriefs ni les rappels", () => {
    expect(notificationCategoriesFor({ ...NONE, isAthlete: true })).toEqual([
      NotificationCategory.PLANNING,
      NotificationCategory.MESSAGE,
      NotificationCategory.BILLING,
      NotificationCategory.INVITATION,
    ]);
  });

  it("n'offre pas la facturation à un Coach seul", () => {
    expect(notificationCategoriesFor({ ...NONE, isCoach: true })).toEqual([
      NotificationCategory.FEEDBACK,
      NotificationCategory.MESSAGE,
      NotificationCategory.INVITATION,
      NotificationCategory.REMINDER,
    ]);
  });

  it("offre tout, dans l'ordre des pastilles, à un compte à double capacité", () => {
    expect(notificationCategoriesFor({ ...NONE, isCoach: true, isAthlete: true })).toEqual(
      Object.values(NotificationCategory),
    );
  });

  // Une Entreprise ne coache ni ne s'entraîne : même le message, reçu des deux côtés, ne la vise pas.
  it("n'offre rien à un compte Entreprise", () => {
    expect(notificationCategoriesFor({ ...NONE, isCompany: true })).toEqual([]);
  });
});

describe("notificationFilterChoices", () => {
  const NONE = { isCoach: false, isAthlete: false, isCompany: false };

  it("ouvre sur « Toutes », puis les catégories reçues avec leur libellé", () => {
    expect(notificationFilterChoices({ ...NONE, isCoach: true })).toEqual([
      { category: null, labelKey: "notification.category.all" },
      { category: NotificationCategory.FEEDBACK, labelKey: "notification.category.feedback" },
      { category: NotificationCategory.MESSAGE, labelKey: "notification.category.message" },
      { category: NotificationCategory.INVITATION, labelKey: "notification.category.invitation" },
      { category: NotificationCategory.REMINDER, labelKey: "notification.category.reminder" },
    ]);
  });

  it("ne propose rien à qui n'a rien à filtrer", () => {
    expect(notificationFilterChoices({ ...NONE, isCompany: true })).toEqual([]);
  });
});

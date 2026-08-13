import { describe, expect, it } from "vitest";
import { NotificationEntityType, NotificationType } from "../dto/notification.schema";
import { ReminderEntityType, ReminderReason, ReminderStatus } from "../dto/reminder.schema";
import {
  isReminderDue,
  parseReminderFeedId,
  REMINDER_BADGE,
  REMINDER_SNOOZE_OPTIONS,
  REMINDER_TARGET_ENTITY_TYPE,
  reminderBadgeState,
  reminderToNotificationDto,
  snoozedDueAt,
  toReminderFeedId,
} from "./reminder.util";

const NOW = new Date("2026-08-07T10:00:00.000Z");

describe("isReminderDue", () => {
  it("est dû dès que l'échéance est passée", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T09:59:00.000Z" }, NOW),
    ).toBe(true);
  });

  it("n'est pas dû tant que l'échéance est à venir", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T10:01:00.000Z" }, NOW),
    ).toBe(false);
  });

  // La borne est INCLUSIVE : à la seconde pile, le rappel est dû. C'est ce que le `lte` de la
  // requête Prisma applique côté API — les deux doivent dire la même chose.
  it("est dû à la seconde exacte de son échéance", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T10:00:00.000Z" }, NOW),
    ).toBe(true);
  });

  it("ne rouvre jamais un rappel traité ou abandonné, même très en retard", () => {
    const past = { dueAt: "2020-01-01T00:00:00.000Z" };
    expect(isReminderDue({ ...past, status: ReminderStatus.DONE }, NOW)).toBe(false);
    expect(isReminderDue({ ...past, status: ReminderStatus.DISMISSED }, NOW)).toBe(false);
  });

  // Un instant illisible ne doit pas fabriquer une alerte : c'est une donnée corrompue, pas un
  // rappel en retard.
  it("n'est pas dû sur une échéance illisible", () => {
    expect(isReminderDue({ status: ReminderStatus.PENDING, dueAt: "hier" }, NOW)).toBe(false);
  });

  /**
   * Le piège que cette fonction existe pour éviter : `dueAt` est un INSTANT, pas une date civile.
   * Comparé comme une chaîne de date (`"2026-08-07" < "2026-08-07T..."`), un rappel du matin
   * paraîtrait dû le soir précédent selon le fuseau du lecteur.
   */
  it("compare des instants, donc tient compte de l'heure et du décalage", () => {
    // 11:30 à Paris (UTC+2 en août) = 09:30 UTC : déjà passé à 10:00 UTC.
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T11:30:00+02:00" }, NOW),
    ).toBe(true);
    // 13:00 à Paris = 11:00 UTC : encore à venir.
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T13:00:00+02:00" }, NOW),
    ).toBe(false);
  });
});

describe("REMINDER_TARGET_ENTITY_TYPE", () => {
  /**
   * Le `satisfies Record<ReminderEntityType, …>` garantit qu'aucune cible ne manque au typecheck.
   * Ce test garde l'autre moitié : que chaque cible mène à une destination DISTINCTE — un
   * copier-coller entre deux lignes voisines passerait la compilation et enverrait un rappel de
   * facture vers l'écran des cycles.
   */
  it("mappe chaque cible de rappel vers une destination distincte", () => {
    const destinations = Object.values(REMINDER_TARGET_ENTITY_TYPE);
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(destinations).toHaveLength(Object.keys(ReminderEntityType).length);
  });

  it("route un rappel de cycle vers le cycle, un rappel de facture vers la facture", () => {
    expect(REMINDER_TARGET_ENTITY_TYPE[ReminderEntityType.PLAN]).toBe(NotificationEntityType.PLAN);
    expect(REMINDER_TARGET_ENTITY_TYPE[ReminderEntityType.INVOICE]).toBe(
      NotificationEntityType.INVOICE,
    );
  });
});

describe("id d'entrée de flux", () => {
  it("fait l'aller-retour", () => {
    expect(parseReminderFeedId(toReminderFeedId("rmd_1"))).toBe("rmd_1");
  });

  // C'est ce `null` qui aiguille le marquage « lu » vers la table `notification` plutôt que vers
  // `reminder`. Un cuid ordinaire ne doit jamais être pris pour un rappel.
  it("rend null sur l'id d'une notification persistée", () => {
    expect(parseReminderFeedId("ckv9v9v9v0000qwerty123456")).toBeNull();
  });

  // Un préfixe sans id derrière n'est pas un identifiant : le laisser passer produirait une requête
  // sur la chaîne vide, qui ne lèverait pas — elle ne trouverait simplement rien.
  it("rend null sur un préfixe sans id", () => {
    expect(parseReminderFeedId("reminder:")).toBeNull();
  });

  // Le préfixe doit être en TÊTE : un id qui contient « reminder: » ailleurs n'en est pas un.
  it("n'accepte pas le préfixe ailleurs qu'au début", () => {
    expect(parseReminderFeedId("ntf_reminder:rmd_1")).toBeNull();
  });
});

describe("reminderBadgeState", () => {
  const pending = { dueAt: "2026-08-15T07:00:00.000Z", status: ReminderStatus.PENDING };

  /**
   * « En retard » prime sur le statut, et c'est toute la raison d'être de cette dérivation :
   * `OVERDUE` n'existe pas dans l'enum stocké, c'est un `PENDING` dont l'échéance est passée. Les
   * deux clients l'indexaient chacun de son côté avant #46.
   */
  it("rend OVERDUE pour un rappel à traiter dont l'échéance est passée", () => {
    expect(reminderBadgeState({ ...pending, dueAt: "2026-08-01T07:00:00.000Z" }, NOW)).toBe(
      "OVERDUE",
    );
    expect(reminderBadgeState(pending, NOW)).toBe(ReminderStatus.PENDING);
  });

  // Le temps ne rouvre pas ce qui a été traité : un rappel fait ou abandonné garde son état, même
  // avec une échéance largement dépassée.
  it("ne rend jamais OVERDUE un rappel traité", () => {
    for (const status of [ReminderStatus.DONE, ReminderStatus.DISMISSED]) {
      expect(reminderBadgeState({ dueAt: "2020-01-01T00:00:00.000Z", status }, NOW)).toBe(status);
    }
  });

  // Le `satisfies` garantit la complétude à la compilation ; ce test la garantit à l'exécution —
  // chaque état d'affichage a bien une pastille, donc aucun indexage ne rend `undefined`.
  it("chaque état d'affichage a une pastille", () => {
    for (const status of Object.values(ReminderStatus)) {
      expect(REMINDER_BADGE[status]).toBeDefined();
    }
    expect(REMINDER_BADGE.OVERDUE.variant).toBe("error");
  });
});

describe("snoozedDueAt", () => {
  /**
   * Calculé depuis MAINTENANT, jamais depuis l'échéance courante. C'est le cas qui décide de la
   * formule : un rappel en retard de trois jours, repoussé « à demain », doit tomber demain — pas
   * il y a deux jours. Partir de `dueAt` produirait une échéance encore passée, donc un rappel qui
   * reste dû juste après qu'on a demandé à ne plus le voir.
   */
  it("part de maintenant, pas de l'échéance courante", () => {
    expect(snoozedDueAt("TOMORROW", NOW)).toBe("2026-08-08T10:00:00.000Z");
    expect(snoozedDueAt("NEXT_WEEK", NOW)).toBe("2026-08-14T10:00:00.000Z");
  });

  /**
   * « Demain » est une opération de CALENDRIER, pas une durée : `setDate` conserve l'heure locale au
   * passage à l'heure d'hiver, là où `+ 24 × 3600 × 1000` la décalerait d'une heure. Le test
   * l'exprime dans le fuseau du système, seul endroit où la distinction est observable — et se
   * contente donc de vérifier l'heure LOCALE, identique de part et d'autre du changement.
   */
  it("conserve l'heure locale à travers un changement d'heure", () => {
    // 2026 : l'heure d'hiver arrive le dimanche 25 octobre en Europe.
    const beforeDstChange = new Date(2026, 9, 24, 9, 30);
    const snoozed = new Date(snoozedDueAt("TOMORROW", beforeDstChange));

    expect(snoozed.getHours()).toBe(9);
    expect(snoozed.getMinutes()).toBe(30);
    expect(snoozed.getDate()).toBe(25);
  });

  // Un report tombe toujours dans le futur : c'est ce qui garantit que le rappel quitte le centre
  // et cesse d'être compté par le badge, sinon le geste n'aurait aucun effet visible.
  it("rend toujours une échéance future", () => {
    for (const option of REMINDER_SNOOZE_OPTIONS) {
      expect(Date.parse(snoozedDueAt(option, NOW))).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe("reminderToNotificationDto", () => {
  const DUE = {
    id: "rmd_1",
    entityType: ReminderEntityType.INVOICE,
    entityId: "inv_1",
    note: "Facture de mars toujours impayée",
    reason: null,
    readAt: null,
    dueAt: "2026-08-07T09:00:00.000Z",
  };

  it("rend une entrée de flux dont l'id est préfixé, adressée à la cible du rappel", () => {
    expect(reminderToNotificationDto(DUE)).toEqual({
      id: "reminder:rmd_1",
      type: NotificationType.REMINDER_DUE,
      entityType: NotificationEntityType.INVOICE,
      entityId: "inv_1",
      actorName: null,
      subjectLabel: "Facture de mars toujours impayée",
      subjectKey: null,
      readAt: null,
      createdAt: "2026-08-07T09:00:00.000Z",
    });
  });

  /**
   * Le rappel AUTO-GÉNÉRÉ (#47) : pas de note, donc le sujet part comme **clé** et non comme
   * valeur. C'est ce qui empêche « le cycle se termine » de voyager figé en français dans une
   * charge utile d'API — la faute exacte que `NOTIFICATION_LABEL_KEY` existe pour interdire.
   */
  it("fait voyager le motif d'un rappel généré comme clé, pas comme libellé", () => {
    const entry = reminderToNotificationDto({
      ...DUE,
      note: null,
      reason: ReminderReason.PLAN_ENDING,
    });

    expect(entry.subjectLabel).toBeNull();
    expect(entry.subjectKey).toBe("reminder.reason.planEnding");
  });

  // La note l'emporte : un rappel généré que le coach s'est approprié en y écrivant sa phrase (#105)
  // doit montrer SA phrase dans le centre, pas l'intitulé système qui l'a fait naître.
  it("préfère la note du coach au motif quand les deux existent", () => {
    const entry = reminderToNotificationDto({
      ...DUE,
      note: "Relancer Marie avant vendredi",
      reason: ReminderReason.INVOICE_OVERDUE,
    });

    expect(entry.subjectLabel).toBe("Relancer Marie avant vendredi");
    expect(entry.subjectKey).toBeNull();
  });

  /**
   * Le choix qui compte : `createdAt` vaut `dueAt`, pas la date de création du rappel. Le centre
   * trie par `createdAt` décroissant — un rappel posé longtemps à l'avance se rangerait sinon à sa
   * date de saisie, enterré sous des semaines de notifications, et invisible le jour où il compte.
   */
  it("date l'entrée de son échéance, pas de sa création", () => {
    const entry = reminderToNotificationDto({ ...DUE, dueAt: "2026-12-24T08:00:00.000Z" });
    expect(entry.createdAt).toBe("2026-12-24T08:00:00.000Z");
  });

  // Un rappel n'a pas d'acteur : le coach se le rappelle à lui-même. Le client rend alors le libellé
  // sans nommer personne.
  it("n'a pas d'acteur, et porte la note en sujet", () => {
    const entry = reminderToNotificationDto(DUE);
    expect(entry.actorName).toBeNull();
    expect(entry.subjectLabel).toBe(DUE.note);
  });

  // Déjà vu dans le centre : l'entrée sort du compteur de non-lues sans que le rappel soit traité.
  it("propage le « vu » du rappel", () => {
    const entry = reminderToNotificationDto({ ...DUE, readAt: "2026-08-07T10:00:00.000Z" });
    expect(entry.readAt).toBe("2026-08-07T10:00:00.000Z");
  });
});

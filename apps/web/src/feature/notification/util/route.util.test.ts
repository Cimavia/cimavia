import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
  type TrainingCapability,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { routeForNotification as route } from "./route.util";

const COACH: Capabilities = { isCoach: true, isAthlete: false, isCompany: false };
const ATHLETE: Capabilities = { isCoach: false, isAthlete: true, isCompany: false };
const BOTH: Capabilities = { isCoach: true, isAthlete: true, isCompany: false };

/** Un compte mono-capacité n'exerce que le titre qu'il a. */
const routeForNotification = (
  dto: NotificationDto,
  capabilities: Capabilities,
  acting: TrainingCapability = capabilities.isCoach ? "coach" : "athlete",
) => route(dto, capabilities, acting);

/**
 * Le type compte désormais (#344) : c'est lui qui dit sous quel titre une notification s'ouvre. Par
 * défaut un cycle diffusé, qui se lit en athlète ; un cas côté coach passe un type de coach.
 */
const notification = (
  entityType: string,
  entityId = "entity-1",
  type: NotificationType = NotificationType.PLAN_PUBLISHED,
): NotificationDto =>
  ({
    id: "n-1",
    type,
    entityType,
    entityId,
    actorName: null,
    subjectLabel: null,
    subjectKey: null,
    readAt: null,
    createdAt: "2026-08-15T09:00:00.000Z",
  }) as NotificationDto;

/**
 * Toute cible qui porte un `search` se compare en `toStrictEqual`, pas en `toEqual` : ce dernier
 * ignore les clés à `undefined`, si bien qu'une clé exigée par la route et oubliée par la cible
 * passerait. Or c'est exactement l'oubli que le typage ne voit pas — `navigate(target)` sur une
 * union échappe au contrôle de TanStack (#251) —, et ce fichier est le seul endroit à le remarquer.
 */
describe("routeForNotification", () => {
  /**
   * La destination dépend du TITRE, pas de la seule cible : les deux rôles reçoivent des
   * notifications sur les mêmes entités sans disposer des mêmes écrans. Envoyer un athlète sur
   * `/plans/$planId` le ferait rebondir — c'est le bug que cette table empêche. Le coach n'atteint
   * un cycle que par un rappel dû.
   */
  it("mène le coach à son builder et l'athlète à son planning, pour une même entité", () => {
    const reminder = notification(
      NotificationEntityType.PLAN,
      "plan-42",
      NotificationType.REMINDER_DUE,
    );
    expect(routeForNotification(reminder, COACH)).toEqual({
      to: "/plans/$planId",
      params: { planId: "plan-42" },
    });
    expect(
      routeForNotification(notification(NotificationEntityType.PLAN, "plan-42"), ATHLETE),
    ).toStrictEqual({
      to: "/planning",
      search: { from: undefined },
    });
  });

  it("mène le coach à la section débriefs et l'athlète à SA séance", () => {
    const feedback = notification(
      NotificationEntityType.SCHEDULED_SESSION,
      "session-7",
      NotificationType.FEEDBACK_RECEIVED,
    );
    expect(routeForNotification(feedback, COACH)).toStrictEqual({
      to: "/feedbacks",
      search: { feedback: undefined, session: undefined },
    });
    const dto = notification(NotificationEntityType.SCHEDULED_SESSION, "session-7");
    expect(routeForNotification(dto, ATHLETE)).toStrictEqual({
      to: "/sessions/$sessionId",
      params: { sessionId: "session-7" },
      search: { from: undefined },
    });
  });

  /**
   * Même route pour les deux rôles, contenu scopé par le tenant. Un message se reçoit des deux
   * côtés ; une facture, en coach par un rappel d'impayé, en athlète à son émission. `as` reste
   * nu : la question du titre ne se pose pas pour un compte mono-capacité (#129).
   */
  it.each([
    // Le fil, et lui seul : l'écran le traduit en interlocuteur, coach ou athlète (#599).
    [
      NotificationEntityType.CONVERSATION,
      NotificationType.MESSAGE_RECEIVED,
      NotificationType.MESSAGE_RECEIVED,
      "/messages",
      {
        athlete: undefined,
        coach: undefined,
        conversation: "entity-1",
        as: undefined,
        q: undefined,
      },
    ],
    [
      NotificationEntityType.INVOICE,
      NotificationType.REMINDER_DUE,
      NotificationType.INVOICE_ISSUED,
      "/invoices",
      { as: undefined, q: undefined, situation: undefined, athlete: undefined },
    ],
  ])(
    "sert %s aux deux rôles sur la même route, le contenu étant scopé par le tenant",
    (entityType, coachType, athleteType, to, search) => {
      expect(
        routeForNotification(notification(entityType, "entity-1", coachType), COACH),
      ).toStrictEqual({ to, search });
      expect(
        routeForNotification(notification(entityType, "entity-1", athleteType), ATHLETE),
      ).toStrictEqual({ to, search });
    },
  );

  /**
   * L'invitation se branche par TITRE, comme le reste de la table : le coach à qui l'on a répondu
   * va voir le nouvel athlète apparaître dans son tableau de suivi, l'athlète invité va à l'écran
   * où l'invitation s'accepte. Le `search` de l'accueil n'est pas décoratif — la route l'exige, et
   * `navigate({ to: "/" })` seul ne compilerait pas.
   */
  it("mène le coach à son tableau de suivi et l'athlète à son écran de rattachement", () => {
    const accepted = notification(
      NotificationEntityType.INVITATION,
      "inv-1",
      NotificationType.INVITATION_ACCEPTED,
    );
    const received = notification(
      NotificationEntityType.INVITATION,
      "inv-1",
      NotificationType.INVITATION_RECEIVED,
    );
    expect(routeForNotification(accepted, COACH)).toStrictEqual({
      to: "/",
      search: { q: undefined, filter: undefined, athlete: undefined },
    });
    expect(routeForNotification(received, ATHLETE)).toEqual({ to: "/my-coach" });
  });

  // L'invitation d'une entreprise (#601) ne vise que des Coachs : sa carte attend sur leur
  // tableau de bord, la destination que la table donne déjà à toute invitation reçue en coach.
  it("mène le coach invité par une entreprise à la carte de son tableau de bord", () => {
    const dto = notification(
      NotificationEntityType.INVITATION,
      "inv-3",
      NotificationType.ORGANIZATION_INVITATION_RECEIVED,
    );
    expect(routeForNotification(dto, COACH)).toStrictEqual({
      to: "/",
      search: { q: undefined, filter: undefined, athlete: undefined },
    });
  });

  /**
   * Le seul type dont la destination est SUPPRIMÉE plutôt que déduite. L'écran existe pourtant —
   * c'est le panneau d'invitations du coach — mais l'entité est morte : l'invitation refusée a
   * quitté `PENDING`, et l'y envoyer le ferait chercher une ligne qui n'y est plus.
   */
  it("ne mène nulle part quand l'invitation a été refusée, des deux côtés", () => {
    const dto = notification(
      NotificationEntityType.INVITATION,
      "inv-2",
      NotificationType.INVITATION_DECLINED,
    );
    expect(routeForNotification(dto, COACH)).toBeNull();
    expect(routeForNotification(dto, ATHLETE)).toBeNull();
  });

  /**
   * `null` et non une destination approximative : la cloche marque alors la notification lue sans
   * naviguer. Une app plus ancienne que l'API ne doit pas deviner où mène un type qu'elle ignore.
   */
  it("rend null sur un type d'entité inconnu, pour les deux capacités", () => {
    const message = NotificationType.MESSAGE_RECEIVED;
    expect(routeForNotification(notification("TYPE_DU_FUTUR", "e", message), COACH)).toBeNull();
    expect(routeForNotification(notification("TYPE_DU_FUTUR", "e", message), ATHLETE)).toBeNull();
  });

  // Un coach qui a cessé de coacher relit un vieux débrief : aucun de ses écrans ne le montre.
  it("ne mène nulle part sous une capacité que le compte n'a plus", () => {
    const dto = notification(
      NotificationEntityType.SCHEDULED_SESSION,
      "session-7",
      NotificationType.FEEDBACK_RECEIVED,
    );
    expect(routeForNotification(dto, ATHLETE)).toBeNull();
  });
});

/**
 * Un compte coach ET athlète (#344). La cloche n'est pas filtrée par espace : elle liste, mêlées,
 * les notifications de ses deux côtés. Chacune mène là où son TYPE dit qu'elle se lit, quel que
 * soit l'espace parcouru — et l'écran servi aux deux reçoit ce titre dans `?as=`.
 */
describe("routeForNotification — compte à double capacité", () => {
  it.each(["coach", "athlete"] as const)(
    "ouvre un cycle diffusé sur le planning, depuis l'espace %s",
    (acting) => {
      expect(route(notification(NotificationEntityType.PLAN, "p-1"), BOTH, acting)).toStrictEqual({
        to: "/planning",
        search: { from: undefined },
      });
    },
  );

  it.each(["coach", "athlete"] as const)(
    "ouvre une invitation reçue sur « Mes coachs », depuis l'espace %s",
    (acting) => {
      const dto = notification(
        NotificationEntityType.INVITATION,
        "inv-1",
        NotificationType.INVITATION_RECEIVED,
      );
      expect(route(dto, BOTH, acting)).toEqual({ to: "/my-coach" });
    },
  );

  it("ouvre un débrief reçu côté coach, même depuis l'espace athlète", () => {
    const dto = notification(
      NotificationEntityType.SCHEDULED_SESSION,
      "session-7",
      NotificationType.FEEDBACK_RECEIVED,
    );
    expect(route(dto, BOTH, "athlete")).toStrictEqual({
      to: "/feedbacks",
      search: { feedback: undefined, session: undefined },
    });
  });

  // Factures sert les deux titres : sans `as`, l'espace coach y montrerait ses propres factures.
  it("ouvre une facture émise dans les factures de l'athlète, même depuis l'espace coach", () => {
    const dto = notification(
      NotificationEntityType.INVOICE,
      "i-1",
      NotificationType.INVOICE_ISSUED,
    );
    expect(route(dto, BOTH, "coach")).toStrictEqual({
      to: "/invoices",
      search: { as: "athlete", q: undefined, situation: undefined, athlete: undefined },
    });
  });

  // Les deux côtés d'un fil reçoivent un message : l'espace parcouru départage, et le reste.
  it("garde l'espace parcouru pour un message", () => {
    const dto = notification(
      NotificationEntityType.CONVERSATION,
      "c-1",
      NotificationType.MESSAGE_RECEIVED,
    );
    expect(route(dto, BOTH, "athlete")).toStrictEqual({
      to: "/messages",
      search: {
        athlete: undefined,
        coach: undefined,
        conversation: "c-1",
        as: "athlete",
        q: undefined,
      },
    });
  });
});

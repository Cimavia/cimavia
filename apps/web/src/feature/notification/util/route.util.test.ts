import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { routeForNotification } from "./route.util";

const COACH: Capabilities = { isCoach: true, isAthlete: false };
const ATHLETE: Capabilities = { isCoach: false, isAthlete: true };

const notification = (entityType: string, entityId = "entity-1"): NotificationDto =>
  ({
    id: "n-1",
    type: NotificationType.PLAN_PUBLISHED,
    entityType,
    entityId,
    actorName: null,
    subjectLabel: null,
    subjectKey: null,
    readAt: null,
    createdAt: "2026-08-15T09:00:00.000Z",
  }) as NotificationDto;

describe("routeForNotification", () => {
  /**
   * La destination dépend de la CAPACITÉ, pas du seul type : les deux rôles reçoivent des
   * notifications sur les mêmes entités sans disposer des mêmes écrans. Envoyer un athlète sur
   * `/plans/$planId` le ferait rebondir — c'est le bug que cette table empêche.
   */
  it("mène le coach à son builder et l'athlète à son planning, pour une même entité", () => {
    const dto = notification(NotificationEntityType.PLAN, "plan-42");
    expect(routeForNotification(dto, COACH)).toEqual({
      to: "/plans/$planId",
      params: { planId: "plan-42" },
    });
    expect(routeForNotification(dto, ATHLETE)).toEqual({ to: "/planning" });
  });

  it("mène le coach à la section débriefs et l'athlète à SA séance", () => {
    const dto = notification(NotificationEntityType.SCHEDULED_SESSION, "session-7");
    expect(routeForNotification(dto, COACH)).toEqual({ to: "/feedbacks" });
    expect(routeForNotification(dto, ATHLETE)).toEqual({
      to: "/sessions/$sessionId",
      params: { sessionId: "session-7" },
    });
  });

  it.each([
    [NotificationEntityType.CONVERSATION, "/messages"],
    [NotificationEntityType.INVOICE, "/invoices"],
  ])("sert %s aux deux rôles sur la même route, le contenu étant scopé par le tenant", (entityType, to) => {
    expect(routeForNotification(notification(entityType), COACH)).toEqual({ to });
    expect(routeForNotification(notification(entityType), ATHLETE)).toEqual({ to });
  });

  /**
   * `null` et non une destination approximative : la cloche marque alors la notification lue sans
   * naviguer. Une app plus ancienne que l'API ne doit pas deviner où mène un type qu'elle ignore.
   */
  it("rend null sur un type d'entité inconnu, pour les deux capacités", () => {
    expect(routeForNotification(notification("TYPE_DU_FUTUR"), COACH)).toBeNull();
    expect(routeForNotification(notification("TYPE_DU_FUTUR"), ATHLETE)).toBeNull();
  });

  /**
   * Limite connue, laissée à #7 : une notification ne dit pas à quel titre on la reçoit. Sur un
   * compte à double capacité, `isCoach` gagne — un cycle mène au builder même si l'entrée
   * concernait l'espace athlète. Le test FIGE ce comportement plutôt que de le taire.
   */
  it("fait gagner la capacité coach sur un compte qui a les deux", () => {
    const both: Capabilities = { isCoach: true, isAthlete: true };
    expect(routeForNotification(notification(NotificationEntityType.PLAN, "p-1"), both)).toEqual({
      to: "/plans/$planId",
      params: { planId: "p-1" },
    });
  });
});

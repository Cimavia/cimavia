import { type NotificationDto, NotificationEntityType, NotificationType } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationApi } from "@/feature/notification/api";
import { NotificationsScreen } from "@/feature/notification/screen/NotificationsScreen";
import {
  ExercisedCapabilityProvider,
  useExercisedCapability,
} from "@/shared/hook/useExercisedCapability";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

// Seuls les appels sont remplacés : les hooks, leurs clés et leurs invalidations restent les VRAIS.
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/notification/api")>();
  return {
    ...original,
    notificationApi: {
      ...original.notificationApi,
      list: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    },
  };
});

const { user } = vi.hoisted(() => ({
  user: { current: { id: "ath-1", isAthlete: true, isCoach: false } },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: user.current }, isPending: false }) },
}));

vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const list = vi.mocked(notificationApi.list);

/** Le titre exercé, lu à côté de l'écran : ce que le sélecteur de Factures montrera en arrivant. */
function ExercisedProbe() {
  return <span data-testid="exercised">{useExercisedCapability() ?? "aucun"}</span>;
}

/** L'écran sous le fournisseur du titre exercé, que `app/_layout.tsx` pose à la racine. */
function Screen() {
  return (
    <ExercisedCapabilityProvider>
      <NotificationsScreen />
      <ExercisedProbe />
    </ExercisedCapabilityProvider>
  );
}

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: "n-1",
    type: NotificationType.PLAN_PUBLISHED,
    entityType: NotificationEntityType.PLAN,
    entityId: "plan-1",
    actorName: "Kylian",
    subjectLabel: "Bloc force",
    subjectKey: null,
    readAt: null,
    createdAt: "2026-09-30T08:00:00.000Z",
    ...overrides,
  };
}

const UNREAD = notification();
const READ = notification({ id: "n-2", readAt: "2026-09-30T09:00:00.000Z" });

const FAILURE = new ApiError(500, "boom", null);

/** La carte de la notification, identifiée par son libellé (la clé, sous `cimode`). */
const card = (container: HTMLElement) =>
  [...container.querySelectorAll("[tabindex]")].find((node) =>
    node.textContent?.startsWith("notification.type.planPublished"),
  ) as HTMLElement;

beforeEach(() => {
  user.current = { id: "ath-1", isAthlete: true, isCoach: false };
  list.mockResolvedValue([UNREAD]);
  vi.mocked(notificationApi.markRead).mockResolvedValue(undefined as never);
  vi.mocked(notificationApi.markAllRead).mockResolvedValue(undefined as never);
});

describe("NotificationsScreen — la liste", () => {
  it("n'affirme rien tant que la liste charge", () => {
    list.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<Screen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.textContent).not.toContain("notification.empty");
  });

  it("dit l'absence de notification", async () => {
    list.mockResolvedValue([]);
    const { findByText } = renderRn(<Screen />);

    expect(await findByText("notification.empty.title")).toBeTruthy();
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("dit la panne plutôt qu'une liste vide, et offre de réessayer", async () => {
    list.mockRejectedValue(FAILURE);
    const { container, findByText } = renderRn(<Screen />);

    expect(await findByText("common.retry")).toBeTruthy();
    expect(container.textContent).not.toContain("notification.empty");

    list.mockResolvedValue([UNREAD]);
    pressButton(container, "common.retry");

    await waitFor(() => expect(card(container)).toBeDefined());
  });

  it("garde les notifications déjà lues quand le rafraîchissement échoue", async () => {
    const { container } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());
    const calls = list.mock.calls.length;

    list.mockRejectedValue(FAILURE);
    press(container.querySelector("[data-refresh]") as HTMLElement);

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(container.querySelector('[data-refresh="idle"]')).not.toBeNull());
    expect(card(container)).toBeDefined();
    expect(container.textContent).not.toContain("common.retry");
  });
});

describe("NotificationsScreen — le libellé", () => {
  function withLabels() {
    const i18n = createInstance();
    i18n.init({
      lng: "test",
      resources: {
        test: {
          translation: {
            notification: {
              someone: "Quelqu'un",
              type: { planPublished: "{{actor}} a diffusé {{subject}}" },
              reason: { planEnding: "la fin du cycle" },
            },
          },
        },
      },
      interpolation: { escapeValue: false },
    });
    return (
      <I18nextProvider i18n={i18n}>
        <Screen />
      </I18nextProvider>
    );
  }

  it.each([
    ["l'acteur et le sujet", {}, "Kylian a diffusé Bloc force"],
    [
      "personne plutôt qu'un trou quand l'acteur manque",
      { actorName: null },
      "Quelqu'un a diffusé Bloc force",
    ],
    ["« — » quand le sujet manque", { subjectLabel: null }, "Kylian a diffusé —"],
    [
      "le sujet traduit quand il voyage comme clé",
      { subjectLabel: null, subjectKey: "notification.reason.planEnding" },
      "Kylian a diffusé la fin du cycle",
    ],
  ])("nomme %s", async (_, overrides, text) => {
    list.mockResolvedValue([notification(overrides)]);
    const { findByText } = renderRn(withLabels());

    expect(await findByText(text)).toBeTruthy();
  });
});

describe("NotificationsScreen — les gestes", () => {
  /**
   * Marquée au toucher, pas à l'ouverture de l'écran — et TOUT le cache est périmé avant de
   * naviguer : la notification annonce un état serveur que le cache persisté n'a pas encore.
   */
  it("marque lue la notification touchée, périme tout le cache et ouvre sa cible", async () => {
    const { container, queryClient } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    press(card(container));

    await waitFor(() =>
      expect(notificationApi.markRead).toHaveBeenCalledWith("n-1", expect.anything()),
    );
    expect(invalidate).toHaveBeenCalledWith();
    expect(router.push).toHaveBeenCalledWith("/planning");
  });

  it("ne remarque pas une notification déjà lue", async () => {
    list.mockResolvedValue([READ]);
    const { container } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());

    press(card(container));

    expect(router.push).toHaveBeenCalledWith("/planning");
    expect(notificationApi.markRead).not.toHaveBeenCalled();
  });

  /**
   * Un cycle se lit en athlète (#344) : un compte coach seul n'a aucun écran pour lui — et le
   * builder est web-only (#20). Rien à ouvrir, mais lue quand même.
   */
  it("reste sur place quand la cible n'a pas d'écran", async () => {
    user.current = { id: "coach-1", isAthlete: false, isCoach: true };
    const { container } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());

    press(card(container));

    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  /**
   * Un compte qui cumule, en titre coach (son persona), touche un cycle diffusé : la notification
   * se lit en athlète, le planning s'ouvre, et le sélecteur passe en athlète AVANT — sans quoi
   * Factures ou Messagerie, ouverts ensuite, montreraient le côté qu'on vient de quitter (#344).
   */
  it("bascule le titre exercé sur celui de la notification avant de l'ouvrir", async () => {
    user.current = { id: "both-1", isAthlete: true, isCoach: true };
    const { container, getByTestId } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());
    expect(getByTestId("exercised").textContent).toBe("coach");

    press(card(container));

    expect(router.push).toHaveBeenCalledWith("/planning");
    await waitFor(() => expect(getByTestId("exercised").textContent).toBe("athlete"));
  });

  it("offre de tout marquer lu tant qu'il reste du non-lu", async () => {
    const { container, findByText } = renderRn(<Screen />);
    await findByText("notification.markAllRead");

    pressButton(container, "notification.markAllRead");

    await waitFor(() => expect(notificationApi.markAllRead).toHaveBeenCalled());
  });

  it("n'offre pas de tout marquer lu quand tout l'est déjà", async () => {
    list.mockResolvedValue([READ]);
    const { container } = renderRn(<Screen />);
    await waitFor(() => expect(card(container)).toBeDefined());

    expect(container.textContent).not.toContain("notification.markAllRead");
  });
});

describe("NotificationsScreen — le filtre par catégorie (#694)", () => {
  // Un athlète seul : ni « Débriefs » ni « Rappels », qu'il ne reçoit pas.
  it("n'offre que les catégories que le compte reçoit", async () => {
    const { findByText, queryByText } = renderRn(<Screen />);

    expect(await findByText("notification.category.all")).toBeTruthy();
    expect(await findByText("notification.category.billing")).toBeTruthy();
    expect(queryByText("notification.category.feedback")).toBeNull();
    expect(queryByText("notification.category.reminder")).toBeNull();
  });

  it("demande la catégorie à l'API, et solde seulement elle", async () => {
    const { container, findByText } = renderRn(<Screen />);
    await findByText("notification.category.billing");

    pressButton(container, "notification.category.billing");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith("BILLING"));
    await findByText("notification.markAllRead");
    pressButton(container, "notification.markAllRead");

    await waitFor(() =>
      expect(notificationApi.markAllRead).toHaveBeenCalledWith("BILLING", expect.anything()),
    );
  });

  it("dit le vide d'une catégorie sans promettre ce qui arrivera", async () => {
    const { container, findByText, queryByText } = renderRn(<Screen />);
    await findByText("notification.category.billing");
    list.mockResolvedValue([]);

    pressButton(container, "notification.category.billing");

    expect(await findByText("notification.empty.category")).toBeTruthy();
    expect(queryByText("notification.empty.description")).toBeNull();
  });

  // Un compte Entreprise ne reçoit rien : pas de ruban du tout.
  it("ne montre aucun filtre à qui n'a rien à filtrer", async () => {
    user.current = { id: "co-1", isAthlete: false, isCoach: false };
    list.mockResolvedValue([]);
    const { findByText, queryByText } = renderRn(<Screen />);

    await findByText("notification.empty.description");
    expect(queryByText("notification.category.all")).toBeNull();
  });
});

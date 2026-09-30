import {
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
  toReminderFeedId,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationApi } from "@/feature/notification/api";
import { renderInRoute } from "../../../../test/render";
import { NotificationBell } from "./NotificationBell";

/**
 * Les VRAIS hooks de la cloche, seul `api.ts` est bouchonné (« Tranché en #507 »). Les capacités
 * se pilotent par la session : c'est elles qui décident où mène une même notification.
 */
const session = vi.hoisted(() => ({
  user: { id: "u_1", name: "Camille", isCoach: true, isAthlete: false },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user }, isPending: false }) },
}));
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/notification/api")>();
  return {
    ...actual,
    notificationApi: {
      ...actual.notificationApi,
      unreadCount: vi.fn(),
      list: vi.fn(),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => undefined),
    },
  };
});

const BELL = "notification.open";

const notification = (
  over: Partial<NotificationDto> & Pick<NotificationDto, "id">,
): NotificationDto => ({
  type: NotificationType.PLAN_PUBLISHED,
  entityType: NotificationEntityType.PLAN,
  entityId: "pln_1",
  actorName: "Camille",
  subjectLabel: "Cycle bloc",
  subjectKey: null,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const UNREAD_PLAN = notification({ id: "n_plan" });
const READ_MESSAGE = notification({
  id: "n_message",
  type: NotificationType.MESSAGE_RECEIVED,
  entityType: NotificationEntityType.CONVERSATION,
  entityId: "conv_1",
  readAt: "2026-09-01T08:00:00.000Z",
});

const DEFAULT_LIST = [UNREAD_PLAN, READ_MESSAGE];

function unread(count: number) {
  vi.mocked(notificationApi.unreadCount).mockResolvedValue({ count, coach: count, athlete: 0 });
}

// Une panne ne vaut que pour le premier appel : le réessai reçoit la liste par défaut.
async function mount(list: NotificationDto[] | Error = DEFAULT_LIST) {
  vi.mocked(notificationApi.list).mockResolvedValue(list instanceof Error ? DEFAULT_LIST : list);
  if (list instanceof Error) vi.mocked(notificationApi.list).mockRejectedValueOnce(list);
  return renderInRoute(<NotificationBell />, {
    path: "/",
    links: ["/plans/$planId", "/planning", "/messages"],
  });
}

async function openBell(view: Awaited<ReturnType<typeof mount>>) {
  await view.user.click(view.getByRole("button", { name: BELL }));
}

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "u_1", name: "Camille", isCoach: true, isAthlete: false };
  unread(2);
});

describe("NotificationBell — le badge", () => {
  it("compte les non-lus sans charger la liste", async () => {
    const { findByText, getByRole } = await mount();

    expect(await findByText("2")).toBeInTheDocument();
    expect(getByRole("button", { name: BELL })).toHaveAttribute("aria-expanded", "false");
    expect(notificationApi.list).not.toHaveBeenCalled();
  });

  // Au-delà, le chiffre exact n'apporte plus rien et déforme la pastille.
  it("plafonne l'affichage à 99+", async () => {
    unread(150);
    const { findByText } = await mount();

    expect(await findByText("99+")).toBeInTheDocument();
  });

  it("ne montre ni pastille ni « tout marquer lu » sans non-lu", async () => {
    unread(0);
    const view = await mount();
    await waitFor(() => expect(notificationApi.unreadCount).toHaveBeenCalled());

    await openBell(view);
    await view.findByText("notification.type.planPublished");

    expect(view.queryByText("0")).toBeNull();
    expect(view.queryByRole("button", { name: "notification.markAllRead" })).toBeNull();
  });
});

describe("NotificationBell — le panneau", () => {
  it("dit qu'il charge à l'ouverture", async () => {
    vi.mocked(notificationApi.list).mockReturnValue(new Promise(() => {}));
    const view = await renderInRoute(<NotificationBell />, { path: "/" });

    await openBell(view);

    expect(view.getByText("common.loading")).toBeInTheDocument();
  });

  it("dit la panne, puis relit la liste au réessai", async () => {
    const view = await mount(new Error("réseau"));
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByText("notification.type.planPublished")).toBeInTheDocument();
    expect(notificationApi.list).toHaveBeenCalledTimes(2);
  });

  it("dit qu'il n'y a rien", async () => {
    const view = await mount([]);
    await openBell(view);

    expect(await view.findByText("notification.empty")).toBeInTheDocument();
  });

  it("distingue le non-lu d'une pastille", async () => {
    const view = await mount();
    await openBell(view);

    const [planRow, messageRow] = await view.findAllByRole("listitem");
    expect(planRow?.querySelector(".bg-cmv-accent")).not.toBeNull();
    expect(messageRow?.querySelector(".bg-cmv-accent")).toBeNull();
  });

  // Acteur introuvable, sujet absent : la ligne se rend quand même, sans trou.
  it("rend une ligne dont l'acteur et le sujet manquent", async () => {
    const view = await mount([notification({ id: "n_1", actorName: null, subjectLabel: null })]);
    await openBell(view);

    expect(await view.findByText("notification.type.planPublished")).toBeInTheDocument();
  });

  it.each([
    ["Échap", async (view: Awaited<ReturnType<typeof mount>>) => view.user.keyboard("{Escape}")],
    [
      "le fond",
      async (view: Awaited<ReturnType<typeof mount>>) =>
        view.user.click(view.getByRole("button", { name: "common.close" })),
    ],
    [
      "la cloche",
      async (view: Awaited<ReturnType<typeof mount>>) =>
        view.user.click(view.getByRole("button", { name: BELL })),
    ],
  ])("se referme par %s", async (_how, close) => {
    const view = await mount();
    await openBell(view);
    await view.findByText("notification.title");

    await close(view);

    expect(view.queryByText("notification.title")).toBeNull();
  });

  it("reste ouvert sur une autre touche", async () => {
    const view = await mount();
    await openBell(view);

    await view.user.keyboard("a");

    expect(view.getByText("notification.title")).toBeInTheDocument();
  });
});

describe("NotificationBell — le clic", () => {
  // Marquée lue au CLIC, et tout le cache périmé : ce qui est affiché ne l'est plus.
  it("marque lue, périme tout, et mène au cycle côté coach", async () => {
    const view = await mount();
    await openBell(view);
    const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");

    await view.user.click(await view.findByRole("button", { name: /planPublished/ }));

    expect(notificationApi.markRead).toHaveBeenCalledWith("n_plan", expect.anything());
    expect(invalidate).toHaveBeenCalledWith();
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/plans/pln_1"));
    expect(view.queryByText("notification.title")).toBeNull();
  });

  it("ne remarque pas une notification déjà lue", async () => {
    const view = await mount();
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: /messageReceived/ }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/messages"));
    expect(notificationApi.markRead).not.toHaveBeenCalled();
  });

  // La même notification de cycle mène au planning de l'athlète, pas au builder du coach.
  it("mène au planning quand on n'est qu'athlète", async () => {
    session.user = { id: "u_2", name: "Léa", isCoach: false, isAthlete: true };
    const view = await mount();
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: /planPublished/ }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/planning"));
  });

  it("reste sur place pour une notification sans destination", async () => {
    const view = await mount([
      notification({
        id: "n_declined",
        type: NotificationType.INVITATION_DECLINED,
        entityType: NotificationEntityType.INVITATION,
      }),
    ]);
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: /invitationDeclined/ }));

    expect(notificationApi.markRead).toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/");
  });

  it("dit l'échec du marquage", async () => {
    vi.mocked(notificationApi.markRead).mockRejectedValueOnce(new Error("réseau"));
    const view = await mount();
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: /planPublished/ }));

    expect(await view.findByRole("status")).toHaveTextContent("common.error");
  });

  it("solde tout d'un geste, puis relit le badge", async () => {
    const view = await mount();
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: "notification.markAllRead" }));

    expect(notificationApi.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(notificationApi.unreadCount).toHaveBeenCalledTimes(2));
  });

  it("dit l'échec du marquage global", async () => {
    vi.mocked(notificationApi.markAllRead).mockRejectedValueOnce(new Error("réseau"));
    const view = await mount();
    await openBell(view);

    await view.user.click(await view.findByRole("button", { name: "notification.markAllRead" }));

    expect(await view.findByRole("status")).toHaveTextContent("common.error");
  });
});

describe("NotificationBell — les rappels dus", () => {
  // Seul un rappel dû se repousse : une notification ordinaire n'a pas d'échéance.
  it("offre de repousser un rappel dû, et lui seul", async () => {
    const view = await mount([
      notification({
        id: toReminderFeedId("r_1"),
        type: NotificationType.REMINDER_DUE,
        subjectLabel: "Relancer Léa",
      }),
      READ_MESSAGE,
    ]);
    await openBell(view);

    const [reminderRow, messageRow] = await view.findAllByRole("listitem");
    expect(reminderRow?.textContent).toContain("reminder.snooze.label");
    expect(messageRow?.textContent).not.toContain("reminder.snooze.label");
  });
});

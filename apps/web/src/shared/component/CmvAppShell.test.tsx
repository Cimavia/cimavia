import { UNKNOWN_COUNTERPARTS, type UnreadCountDto } from "@cmv/shared";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationApi } from "@/feature/notification/api";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { authClient } from "@/shared/lib/auth";
import { NAV_ITEMS } from "@/shared/lib/nav";
import { renderInRoute } from "../../../test/render";
import { CmvAppShell } from "./CmvAppShell";
import { CmvLeaveDialog } from "./CmvLeaveDialog";

const session = vi.hoisted(() => ({
  user: { id: "u-1", name: "Dual Curl", isCoach: true, isAthlete: true } as Record<string, unknown>,
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: session.user }, isPending: false }),
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("@/feature/notification/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/notification/api")>()),
  notificationApi: { unreadCount: vi.fn(), list: vi.fn(async () => []) },
}));
// La nav des deux espaces en dépend ; ce qu'elle en DÉCIDE est testé dans `nav.test.ts`.
vi.mock("@/shared/hook/useCounterparts", () => ({ useCounterparts: () => UNKNOWN_COUNTERPARTS }));

function unread(count: UnreadCountDto) {
  vi.mocked(notificationApi.unreadCount).mockResolvedValue(count);
}

/** Un écran qui porte une saisie non enregistrée (#327). */
function Unsaved() {
  const guard = useLeaveGuard(true);
  return <CmvLeaveDialog {...guard.dialog} />;
}

const open = ({ unsaved = false } = {}) =>
  renderInRoute(
    <CmvAppShell title="Tableau de bord">
      <p>contenu</p>
      {unsaved ? <Unsaved /> : null}
    </CmvAppShell>,
    // Une route par cible : `/messages` et `/invoices` figurent une fois dans chaque espace.
    {
      path: "/",
      links: [...new Set(["/login", "/account", ...NAV_ITEMS.map((item) => item.to)])].filter(
        (to) => to !== "/",
      ),
    },
  );

beforeEach(() => {
  session.user = { id: "u-1", name: "Dual Curl", isCoach: true, isAthlete: true };
  unread({ count: 0, coach: 0, athlete: 0 });
});

describe("CmvAppShell — le basculeur d'espace", () => {
  it("n'existe pas pour un compte mono-capacité", async () => {
    session.user = { id: "u-1", name: "Coach", isCoach: true, isAthlete: false };
    const { queryByRole, getByText } = await open();

    expect(getByText("contenu")).toBeInTheDocument();
    expect(queryByRole("tablist")).toBeNull();
  });

  it("signale ce qui attend dans l'espace qu'on ne regarde pas, et là seulement", async () => {
    unread({ count: 3, coach: 1, athlete: 2 });
    const { findByRole, getByRole } = await open();

    const athleteTab = await findByRole("tab", { name: /nav\.space\.athlete/ });
    await waitFor(() =>
      expect(within(athleteTab).getByText("nav.spaceUnread")).toBeInTheDocument(),
    );
    // L'espace ouvert (`/` est coach) se tait : la cloche dit déjà ce qui arrive.
    const coachTab = getByRole("tab", { name: /nav\.space\.coach/ });
    expect(coachTab).toHaveAttribute("aria-selected", "true");
    expect(within(coachTab).queryByText("nav.spaceUnread")).toBeNull();
  });

  it("ne pose pas de pastille sur un espace où rien n'attend", async () => {
    unread({ count: 1, coach: 1, athlete: 0 });
    const { findByRole, queryByText } = await open();

    await findByRole("tab", { name: /nav\.space\.athlete/ });
    await waitFor(() => expect(notificationApi.unreadCount).toHaveBeenCalled());

    expect(queryByText("nav.spaceUnread")).toBeNull();
  });
});

describe("CmvAppShell — la déconnexion", () => {
  it("coupe la session, vide ce que l'onglet garde du compte et ramène au login", async () => {
    const { user, getByRole, queryClient, router } = await open();
    queryClient.setQueryData(["athletes"], [{ id: "a-1" }]);

    await user.click(getByRole("button", { name: "common.logout" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    // Sans ce vidage, le compte suivant se connectait sur les données du précédent (#341).
    expect(queryClient.getQueryData(["athletes"])).toBeUndefined();
  });
});

describe("CmvAppShell — se déconnecter avec une saisie non enregistrée (#327)", () => {
  beforeEach(() => {
    vi.mocked(authClient.signOut).mockClear();
  });

  // Demander APRÈS avoir coupé la session laissait le coach déconnecté sur l'écran qu'il gardait.
  it("demande AVANT de couper la session, et « Rester » laisse le coach connecté", async () => {
    const { user, getByRole, findByRole, queryByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.stay" }));

    await waitFor(() => expect(queryByRole("dialog")).not.toBeInTheDocument());
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/");
  });

  it("déconnecte et ramène au login une fois la perte confirmée, sans redemander", async () => {
    const { user, getByRole, findByRole, queryByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.leave" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(queryByRole("dialog")).not.toBeInTheDocument();
  });
});

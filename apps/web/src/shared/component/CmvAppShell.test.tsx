import { UNKNOWN_COUNTERPARTS, type UnreadCountDto } from "@cmv/shared";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationApi } from "@/feature/notification/api";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { authClient } from "@/shared/lib/auth";
import { NAV_ITEMS } from "@/shared/lib/nav";
import { renderInRoute } from "../../../test/render";
import { CmvAppShell, type CmvBackLink } from "./CmvAppShell";
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

/** L'enregistrement de l'écran gardé : réussi, sauf quand un test le refuse. */
const saveUnsaved = vi.fn(async () => true);

/** Un écran qui porte une saisie non enregistrée (#327). */
function Unsaved() {
  const guard = useLeaveGuard(true, saveUnsaved);
  return <CmvLeaveDialog {...guard.dialog} />;
}

/** Le retour d'un écran Athlete : une route et sa semaine, comme le débrief le transmet (#251). */
const BACK: CmvBackLink<{ to: "/planning"; search: { from: string } }> = {
  label: "Mon planning",
  link: { to: "/planning", search: { from: "2026-11-09" } },
};

const open = ({ unsaved = false, fill = false, back = false } = {}) =>
  renderInRoute(
    <CmvAppShell title="Tableau de bord" fill={fill} back={back ? BACK : undefined}>
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
    saveUnsaved.mockClear();
    saveUnsaved.mockResolvedValue(true);
  });

  // Demander APRÈS avoir coupé la session laissait le coach déconnecté sur l'écran qu'il gardait.
  it("demande AVANT de couper la session, et « Annuler » laisse le coach connecté", async () => {
    const { user, getByRole, findByRole, queryByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.cancel" }));

    await waitFor(() => expect(queryByRole("dialog")).not.toBeInTheDocument());
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/");
  });

  it("déconnecte et ramène au login une fois la perte confirmée, sans redemander", async () => {
    const { user, getByRole, findByRole, queryByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.discard" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(saveUnsaved).not.toHaveBeenCalled();
    expect(queryByRole("dialog")).not.toBeInTheDocument();
  });

  // La session est valide au moment de la question : on écrit d'abord, on coupe ensuite (#682).
  it("enregistre, PUIS déconnecte", async () => {
    vi.mocked(authClient.signOut).mockImplementationOnce(async () => {
      expect(saveUnsaved).toHaveBeenCalledOnce();
      return undefined;
    });
    const { user, getByRole, findByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(authClient.signOut).toHaveBeenCalledOnce();
  });

  it("reste connecté quand l'enregistrement est refusé", async () => {
    saveUnsaved.mockResolvedValue(false);
    const { user, getByRole, findByRole, queryByRole, router } = await open({ unsaved: true });

    await user.click(getByRole("button", { name: "common.logout" }));
    await user.click(await findByRole("button", { name: "common.leave.save" }));

    await waitFor(() => expect(queryByRole("dialog")).not.toBeInTheDocument());
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("CmvAppShell — un compte Entreprise (#600)", () => {
  const openCompany = () =>
    renderInRoute(
      <CmvAppShell title="Coachs">
        <p>contenu</p>
      </CmvAppShell>,
      {
        path: "/company/coaches",
        links: ["/login", "/account", "/company/athletes"],
      },
    );

  beforeEach(() => {
    session.user = { id: "u-f", name: "Altitude Club", isCompany: true, role: "COMPANY" };
  });

  it("ne montre que son espace, sans basculeur", async () => {
    const { getByRole, getByText, queryByRole } = await openCompany();

    expect(getByText("nav.spaceTitle.company")).toBeInTheDocument();
    expect(getByRole("link", { name: "nav.companyAthletes" })).toBeInTheDocument();
    expect(queryByRole("link", { name: "nav.library" })).toBeNull();
    expect(queryByRole("tablist")).toBeNull();
  });

  // `/account` lui est fermé : un lien vers elle le renverrait aussitôt d'où il vient.
  it("montre son nom sans lien vers la page Compte", async () => {
    const { getByText, queryByRole } = await openCompany();

    expect(getByText("Altitude Club")).toBeInTheDocument();
    expect(queryByRole("link", { name: "Altitude Club" })).toBeNull();
  });
});

describe("CmvAppShell — la page qui tient dans l'écran", () => {
  it("donne à son contenu toute la hauteur de l'écran, et rien de plus par défaut", async () => {
    const filled = await open({ fill: true });
    expect(filled.getByRole("main")).toHaveClass("h-screen");
    expect(filled.getByText("contenu").parentElement).toHaveClass("flex-1");
    filled.unmount();

    const plain = await open();
    expect(plain.getByRole("main")).not.toHaveClass("h-screen");
  });
});

describe("CmvAppShell — le retour d'écran (#746)", () => {
  // Le bandeau par sa balise : un `<header>` dans `<main>` n'est pas le repère `banner`.
  it("est un lien du bandeau vers sa destination, semaine comprise", async () => {
    const { getByRole } = await open({ back: true });

    const back = getByRole("link", { name: "Mon planning" });
    expect(back.closest("header")).not.toBeNull();
    expect(back).toHaveAttribute("href", "/planning?from=2026-11-09");
  });

  // Groupé avec le titre : le retour à la ligne des actions ne l'isole jamais.
  it("se place à gauche du titre, dans le même groupe", async () => {
    const { getByRole } = await open({ back: true });

    const back = getByRole("link", { name: "Mon planning" });
    const group = back.parentElement as HTMLElement;
    expect(within(group).getByRole("heading", { name: "Tableau de bord" })).toBeInTheDocument();
    expect(group.firstElementChild).toBe(back);
  });

  it("n'existe pas sans destination", async () => {
    const { container } = await open();

    expect(within(container.querySelector("header") as HTMLElement).queryByRole("link")).toBeNull();
  });

  it("retient la sortie d'une saisie non enregistrée, puis mène à sa destination", async () => {
    const { user, getByRole, findByRole, router } = await open({ back: true, unsaved: true });

    await user.click(getByRole("link", { name: "Mon planning" }));
    expect(await findByRole("dialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");

    await user.click(getByRole("button", { name: "common.leave.discard" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/planning"));
    expect(router.state.location.search).toEqual({ from: "2026-11-09" });
  });
});

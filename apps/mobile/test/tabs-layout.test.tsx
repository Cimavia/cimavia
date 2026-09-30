import type { CounterpartsDto, UnreadCountDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { usePathname } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppTabsLayout from "@/app/(app)/_layout";
import MessagesLayout from "@/app/(app)/messages/_layout";
import { accountApi } from "@/feature/account/api";
import { notificationApi } from "@/feature/notification/api";
import { usePushToken } from "@/feature/notification/hook/usePushToken";
import { authClient } from "@/shared/lib/auth";
import { renderRn } from "@/test/render";

/**
 * La barre d'onglets du mobile, et la pile de son onglet Messages. Ce test vit dans `test/` et non à côté du layout : expo-router
 * embarque tout fichier de `app/` comme une route (cf. `root-layout.test.tsx`).
 *
 * `Tabs` est remplacé par un double qui REND les options de chaque écran — titre, `href`, pastille,
 * icône — là où celui du harnais les jette. C'est ce qui fait de ce test le filet de #504 : quand
 * `tabBarIcon` sortira du rendu (S6478), il dira que les onglets, leurs icônes et le badge n'ont
 * pas bougé.
 */
vi.mock("expo-router", () => {
  type ScreenOptions = {
    title: string;
    href?: null;
    tabBarBadge?: string | number;
    tabBarIcon: (props: { color: string; size: number; focused: boolean }) => ReactElement;
  };
  const Screen = ({ name, options }: Readonly<{ name: string; options: ScreenOptions }>) => (
    <div
      data-tab={name}
      data-hidden={String(options.href === null)}
      data-badge={options.tabBarBadge == null ? "" : String(options.tabBarBadge)}
    >
      {options.title}
      {options.tabBarIcon({ color: "tint", size: 24, focused: false })}
    </div>
  );
  const Tabs = ({
    children,
    screenOptions,
  }: Readonly<{ children: ReactNode; screenOptions: { tabBarHideOnKeyboard: boolean } }>) => (
    <div data-tabs data-hide-on-keyboard={String(screenOptions.tabBarHideOnKeyboard)}>
      {children}
    </div>
  );
  const Stack = ({ screenOptions }: Readonly<{ screenOptions: { headerShown: boolean } }>) => (
    <div data-stack data-header-shown={String(screenOptions.headerShown)} />
  );
  return {
    Stack,
    Tabs: Object.assign(Tabs, { Screen }),
    Redirect: ({ href }: Readonly<{ href: string }>) => <span data-redirect={String(href)} />,
    usePathname: vi.fn(() => "/"),
  };
});

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));
// L'enregistrement de l'appareil a son propre test : ici, seul compte que le layout le déclenche.
vi.mock("@/feature/notification/hook/usePushToken", () => ({
  usePushToken: vi.fn(),
  revokeCurrentPushToken: vi.fn(),
}));
// Les appels sont remplacés, les hooks et les clés de cache restent les VRAIS.
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/notification/api")>();
  return { ...original, notificationApi: { ...original.notificationApi, unreadCount: vi.fn() } };
});
vi.mock("@/feature/account/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/account/api")>();
  return { ...original, accountApi: { ...original.accountApi, myCounterparts: vi.fn() } };
});

type Session = { isCoach: boolean; isAthlete: boolean } | null;

const COACH: Session = { isCoach: true, isAthlete: false };
const ATHLETE: Session = { isCoach: false, isAthlete: true };

function setup({
  session = COACH,
  isPending = false,
  pathname = "/",
  unread = 0,
  counterparts = { asCoach: true, asAthlete: false },
}: {
  session?: Session;
  isPending?: boolean;
  pathname?: string;
  unread?: number;
  counterparts?: CounterpartsDto;
} = {}) {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: session == null ? null : { user: { id: "me", ...session } },
    isPending,
  } as unknown as ReturnType<typeof authClient.useSession>);
  vi.mocked(usePathname).mockReturnValue(pathname);
  vi.mocked(notificationApi.unreadCount).mockResolvedValue({
    count: unread,
    coach: unread,
    athlete: 0,
  } satisfies UnreadCountDto);
  vi.mocked(accountApi.myCounterparts).mockResolvedValue(counterparts);
  return renderRn(<AppTabsLayout />);
}

const redirectOf = (container: HTMLElement) =>
  container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;

function tab(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-tab="${name}"]`);
  if (element == null) throw new Error(`onglet ${name} non déclaré`);
  return element;
}

/** Les onglets affichés dans la barre, dans l'ordre — ceux qu'`href: null` ne retire pas. */
const shownTabs = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-tab][data-hidden="false"]')].map((element) =>
    element.getAttribute("data-tab"),
  );

const badgeOf = (container: HTMLElement, name: string) =>
  tab(container, name).getAttribute("data-badge");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("barre d'onglets — ce qui est déclaré", () => {
  /**
   * Expo Router enregistre TOUT fichier du dossier comme onglet : masquer passe par `href: null`,
   * jamais par l'omission. Les sept écrans sont donc déclarés quel que soit le compte.
   */
  it("déclare chaque écran, avec son libellé et son icône", () => {
    const { container } = setup();

    const declared = [...container.querySelectorAll("[data-tab]")].map((element) => [
      element.getAttribute("data-tab"),
      element.textContent,
      element.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ]);
    expect(declared).toEqual([
      ["dashboard", "nav.dashboard", "grid-outline"],
      ["planning", "nav.planning", "calendar-outline"],
      ["sessions", "nav.sessions", "barbell-outline"],
      ["messages", "nav.messages", "chatbubble-outline"],
      ["invoices", "nav.invoices", "receipt-outline"],
      ["notifications", "nav.notifications", "notifications-outline"],
      ["profile", "nav.profile", "person-outline"],
    ]);
  });

  /** Sans ça, dans la messagerie, la barre reste posée entre le clavier et le champ de saisie. */
  it("se masque à l'ouverture du clavier", () => {
    const { container } = setup();

    expect(container.querySelector("[data-tabs]")?.getAttribute("data-hide-on-keyboard")).toBe(
      "true",
    );
  });

  it("enregistre l'appareil pour les push dès la zone authentifiée", () => {
    setup();

    expect(usePushToken).toHaveBeenCalled();
  });
});

describe("barre d'onglets — ce qui est montré", () => {
  it("montre au coach ses onglets et cache ceux de l'athlète", () => {
    const { container } = setup({ session: COACH });

    expect(shownTabs(container)).toEqual([
      "dashboard",
      "messages",
      "invoices",
      "notifications",
      "profile",
    ]);
  });

  it("montre à l'athlète ses onglets et cache le tableau de bord", () => {
    const { container } = setup({
      session: ATHLETE,
      counterparts: { asCoach: false, asAthlete: true },
    });

    expect(shownTabs(container)).toEqual([
      "planning",
      "sessions",
      "messages",
      "invoices",
      "notifications",
      "profile",
    ]);
  });

  /** Sans interlocuteur, il n'y a rien à lire dans la messagerie (#198). */
  it("retire la messagerie une fois su qu'il n'y a personne en face", async () => {
    const { container } = setup({ counterparts: { asCoach: false, asAthlete: false } });

    await waitFor(() =>
      expect(tab(container, "messages").getAttribute("data-hidden")).toBe("true"),
    );
  });
});

describe("barre d'onglets — pastille des notifications", () => {
  it("ne pose aucune pastille quand rien n'attend", async () => {
    const { container } = setup({ unread: 0 });

    await waitFor(() => expect(notificationApi.unreadCount).toHaveBeenCalled());
    expect(badgeOf(container, "notifications")).toBe("");
  });

  it("affiche le nombre exact, sur l'onglet des notifications seulement", async () => {
    const { container } = setup({ unread: 7 });

    await waitFor(() => expect(badgeOf(container, "notifications")).toBe("7"));
    expect(
      [...container.querySelectorAll("[data-tab]")]
        .filter((element) => element.getAttribute("data-badge") !== "")
        .map((element) => element.getAttribute("data-tab")),
    ).toEqual(["notifications"]);
  });

  /** Au-delà de 99, le chiffre exact n'apporte rien et déborde de la pastille. */
  it("plafonne à 99+", async () => {
    const { container } = setup({ unread: 100 });

    await waitFor(() => expect(badgeOf(container, "notifications")).toBe("99+"));
  });

  it("garde 99 tel quel", async () => {
    const { container } = setup({ unread: 99 });

    await waitFor(() => expect(badgeOf(container, "notifications")).toBe("99"));
  });
});

describe("barre d'onglets — la route initiale", () => {
  /**
   * `href: null` masque l'onglet sans choisir la route initiale : un coach atterrissait sur
   * `/planning`, premier écran déclaré, avec une barre pourtant juste.
   */
  it("renvoie le coach d'un onglet d'athlète vers son tableau de bord", () => {
    const { container } = setup({ session: COACH, pathname: "/planning" });

    expect(redirectOf(container)).toBe("/dashboard");
    expect(container.querySelector("[data-tabs]")).toBeNull();
  });

  it("laisse en place un onglet ouvert à la capacité", () => {
    const { container } = setup({ session: COACH, pathname: "/dashboard" });

    expect(redirectOf(container)).toBeNull();
  });

  /**
   * Tant que la session n'est pas résolue ET présente, « aucune capacité » ne veut rien dire : une
   * redirection déposerait l'utilisateur ailleurs que sur son onglet.
   */
  it.each([
    ["en cours de résolution", COACH, true],
    ["tout juste quittée", null, false],
  ])("ne redirige pas sur une session %s", (_, session, isPending) => {
    const { container } = setup({ session, isPending, pathname: "/planning" });

    expect(redirectOf(container)).toBeNull();
  });
});

describe("pile de l'onglet Messages", () => {
  /** Chaque écran de la pile porte son propre bandeau : celui du navigateur ferait doublon. */
  it("n'ajoute pas d'en-tête de navigation", () => {
    const { container } = renderRn(<MessagesLayout />);

    expect(container.querySelector("[data-stack]")?.getAttribute("data-header-shown")).toBe(
      "false",
    );
  });
});

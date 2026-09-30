import {
  type CoachAthleteDto,
  type CoachFeedbackSummaryDto,
  type ConversationDto,
  type InvoiceDto,
  InvoiceStatus,
  mondayOfIsoWeek,
  PlanStatus,
  type PlanSummaryDto,
  shiftIsoDate,
  todayIsoDate,
} from "@cmv/shared";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi } from "@/feature/athlete/api";
import { coachFeedbackApi } from "@/feature/feedback/api";
import { invoiceApi } from "@/feature/invoice/api";
import { messageApi } from "@/feature/message/api";
import { notificationApi } from "@/feature/notification/api";
import { listPlans } from "@/feature/plan/api";
import { reminderApi } from "@/feature/reminder/api";
import { renderInRoute } from "../../../../test/render";
import { DashboardScreen } from "./DashboardScreen";

/**
 * Les VRAIS hooks des sept sources, seuls leurs `api.ts` sont bouchonnés (« Tranché en #507 ») :
 * ce qui s'éprouve ici est ce que l'écran fait de réponses et de pannes RÉELLES — lesquelles il
 * rejoue, ce qu'il tait, ce qu'il n'invente pas.
 */
vi.mock("@/feature/athlete/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/athlete/api")>();
  return {
    ...actual,
    accountApi: {
      ...actual.accountApi,
      listAthletes: vi.fn(),
      getAthleteSheet: vi.fn(async () => null),
      listInvitations: vi.fn(async () => []),
    },
  };
});
vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  listPlans: vi.fn(),
}));
vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/feedback/api")>();
  return { ...actual, coachFeedbackApi: { ...actual.coachFeedbackApi, list: vi.fn() } };
});
vi.mock("@/feature/invoice/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/invoice/api")>();
  return { ...actual, invoiceApi: { ...actual.invoiceApi, list: vi.fn() } };
});
vi.mock("@/feature/message/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/message/api")>();
  return { ...actual, messageApi: { ...actual.messageApi, listConversations: vi.fn() } };
});
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/reminder/api")>();
  return { ...actual, reminderApi: { ...actual.reminderApi, summary: vi.fn() } };
});
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/notification/api")>();
  return { ...actual, notificationApi: { ...actual.notificationApi, unreadCount: vi.fn() } };
});
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "coach_1", name: "Camille", isCoach: true, isAthlete: false } },
    }),
  },
}));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    actions,
    children,
  }: Readonly<{ title: string; actions?: unknown; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {actions as never}
      {children as never}
    </div>
  ),
}));

const TODAY = todayIsoDate();
const THIS_MONDAY = mondayOfIsoWeek(TODAY) ?? TODAY;
const weeksFrom = (weeks: number) => shiftIsoDate(THIS_MONDAY, weeks * 7) ?? THIS_MONDAY;

const athlete = (athleteId: string, athleteName: string) =>
  ({ athleteId, athleteName, isSelf: false }) as CoachAthleteDto;

const LEA = athlete("ath_lea", "Léa Moreau");
const NOAH = athlete("ath_noah", "Noah Fontaine");

const plan = (athleteId: string, startDate: string, weekCount = 4) =>
  ({
    id: `pln_${athleteId}_${startDate}`,
    athleteId,
    title: `Cycle de ${athleteId}`,
    startDate,
    weekCount,
    status: PlanStatus.PUBLISHED,
  }) as PlanSummaryDto;

const FEEDBACK = {
  id: "fb_1",
  athleteId: "ath_lea",
  coachReadAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
} as CoachFeedbackSummaryDto;

// Échue depuis longtemps : la facture la plus récente de Léa est EN RETARD.
const OVERDUE = {
  id: "inv_1",
  athleteId: "ath_lea",
  status: InvoiceStatus.PENDING,
  issuedAt: "2026-01-01T10:00:00.000Z",
  dueDate: "2026-01-15",
} as InvoiceDto;

const CONVERSATION = { counterpartId: "ath_lea", unreadCount: 2 } as ConversationDto;

const LINKS = ["/feedbacks", "/reminders", "/invoices", "/messages", "/plans"];

type Sources = {
  athletes?: CoachAthleteDto[] | Error;
  plans?: PlanSummaryDto[] | Error;
  invoices?: InvoiceDto[] | Error;
  conversations?: ConversationDto[] | Error;
};

function answer(fn: unknown, value: unknown) {
  const mock = vi.mocked(fn as () => Promise<unknown>);
  if (value instanceof Error) mock.mockRejectedValue(value);
  else mock.mockResolvedValue(value);
}

async function mount(sources: Sources = {}, search: Record<string, string> = {}) {
  answer(accountApi.listAthletes, sources.athletes ?? [LEA, NOAH]);
  answer(listPlans, sources.plans ?? [plan("ath_lea", THIS_MONDAY)]);
  answer(invoiceApi.list, sources.invoices ?? [OVERDUE]);
  answer(coachFeedbackApi.list, [FEEDBACK]);
  answer(messageApi.listConversations, sources.conversations ?? [CONVERSATION]);
  answer(reminderApi.summary, { dueCount: 0 });
  answer(notificationApi.unreadCount, { count: 5, coach: 5, athlete: 0 });

  const view = await renderInRoute(<DashboardScreen />, { path: "/", search, links: LINKS });
  // Les tuiles répondent toutes : la dernière source à arriver est la liste d'athlètes.
  await view.findByText("dashboard.section.todo");
  return view;
}

/** La tuile dont le libellé est `label` — une carte, bouton si elle mène quelque part. */
async function tile(view: Awaited<ReturnType<typeof mount>>, label: string) {
  const labelNode = await view.findByText(label);
  const card = labelNode.parentElement;
  if (card == null) throw new Error(`tuile ${label} introuvable`);
  return within(card);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardScreen — les tuiles", () => {
  it("chiffre ce qui attend, et colore la tuile qui a vraiment quelque chose à signaler", async () => {
    const view = await mount();

    const feedback = await tile(view, "dashboard.tiles.feedback");
    await waitFor(() => expect(feedback.getByText("1")).toHaveClass("text-cmv-warning-on"));
    const overdue = await tile(view, "dashboard.tiles.overdueInvoices");
    expect(overdue.getByText("1")).toHaveClass("text-cmv-error-on");
  });

  // La couleur marque l'EXCEPTION (#37) : un « 0 » en ambre crierait au loup.
  it("laisse neutre une tuile à traiter qui n'a rien à traiter", async () => {
    const view = await mount();

    const reminders = await tile(view, "dashboard.tiles.remindersDue");
    await waitFor(() => expect(reminders.getByText("0")).toHaveClass("text-cmv-text-hi"));
  });

  it("mène de la tuile à ce qu'elle annonce", async () => {
    const view = await mount();

    await view.user.click(await view.findByText("dashboard.tiles.remindersDue"));

    expect(view.router.state.location.pathname).toBe("/reminders");
  });

  it("montre la vue d'ensemble telle que les sources l'ont servie", async () => {
    const view = await mount();

    const athletes = await tile(view, "dashboard.tiles.athletes");
    await waitFor(() => expect(athletes.getByText("2")).toBeInTheDocument());
    const notifications = await tile(view, "dashboard.tiles.notifications");
    await waitFor(() => expect(notifications.getByText("5")).toBeInTheDocument());
  });
});

/**
 * Sept requêtes, donc sept pannes possibles — et le « — » d'une tuile ne distingue pas une panne
 * d'un chargement. Sans le bandeau, une API injoignable se lirait « rien à traiter ».
 */
describe("DashboardScreen — une source en panne", () => {
  it("dit la panne, tait la tuile concernée et garde lisibles celles qui ont répondu", async () => {
    const view = await mount({ invoices: new Error("réseau") });

    expect(await view.findByText("dashboard.error.title")).toBeInTheDocument();
    const overdue = await tile(view, "dashboard.tiles.overdueInvoices");
    expect(overdue.getByText("—")).toBeInTheDocument();
    const feedback = await tile(view, "dashboard.tiles.feedback");
    expect(feedback.getByText("1")).toBeInTheDocument();
  });

  it("ne rejoue que la source en échec", async () => {
    const view = await mount({ invoices: new Error("réseau") });
    await view.findByText("dashboard.error.title");
    vi.mocked(invoiceApi.list).mockClear();
    vi.mocked(accountApi.listAthletes).mockClear();

    await view.user.click(view.getByRole("button", { name: "common.retry" }));

    await waitFor(() => expect(invoiceApi.list).toHaveBeenCalledOnce());
    expect(accountApi.listAthletes).not.toHaveBeenCalled();
  });

  // Un tableau vide laisserait croire que le coach n'a aucun athlète.
  it("ne monte pas le tableau quand la liste des athlètes manque", async () => {
    const view = await mount({ athletes: new Error("réseau") });

    await view.findByText("dashboard.error.title");
    expect(view.queryByText("dashboard.section.athletes")).toBeNull();
    expect(view.queryByText("athlete.empty.title")).toBeNull();
  });
});

describe("DashboardScreen — le tableau de suivi", () => {
  it("donne à chaque colonne sa destination, et la dit en clair", async () => {
    const view = await mount();

    await view.findByText("Léa Moreau");
    expect(view.getByRole("link", { name: "1" })).toHaveAttribute(
      "href",
      "/feedbacks?feedback=fb_1",
    );
    expect(view.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/messages?athlete=ath_lea&as=coach",
    );
    expect(view.getByText("invoice.status.overdue")).toBeInTheDocument();
    expect(view.getByText("dashboard.table.weekProgress")).toBeInTheDocument();
  });

  // Proposer d'ouvrir ce qu'on n'a pas pu lire serait mentir deux fois : « — », et aucun lien.
  it("tait sans lien la colonne dont la source est en panne", async () => {
    const view = await mount({ conversations: new Error("réseau") });

    await view.findByText("Léa Moreau");
    expect(view.queryByRole("link", { name: "2" })).toBeNull();
    expect(
      view.getAllByRole("link").some((link) => link.getAttribute("href")?.startsWith("/messages")),
    ).toBe(false);
  });

  it("propose un cycle à l'athlète qui n'en a pas", async () => {
    const view = await mount();

    await view.findByText("Noah Fontaine");
    expect(view.getByRole("link", { name: "dashboard.table.createPlan" })).toBeInTheDocument();
  });

  // « Fini » et « commence lundi » sont contraires : un seul appelle un geste du coach.
  it("date le cycle clos et le cycle à venir, sans leur prêter une progression", async () => {
    const view = await mount({
      plans: [plan("ath_lea", weeksFrom(-8)), plan("ath_noah", weeksFrom(2))],
    });

    expect(await view.findByText("dashboard.table.planEnded")).toBeInTheDocument();
    expect(view.getByText("dashboard.table.planUpcoming")).toBeInTheDocument();
    expect(view.queryByText("dashboard.table.weekProgress")).toBeNull();
  });

  /**
   * Cycles illisibles : `plan` vaut `null` pour TOUT LE MONDE. Proposer d'en créer, ou filtrer
   * « Sans plan », annoncerait l'écurie entière comme étant à planifier.
   */
  it("ne propose ni cycle ni filtre de cycle quand les cycles n'ont pas pu être lus", async () => {
    const view = await mount({ plans: new Error("réseau") }, { filter: "NO_PLAN" });

    await view.findByText("Noah Fontaine");
    expect(view.getByText("Léa Moreau")).toBeInTheDocument();
    expect(view.queryByRole("link", { name: "dashboard.table.createPlan" })).toBeNull();
    expect(view.queryByRole("button", { name: "dashboard.table.filter.NO_PLAN" })).toBeNull();
  });

  it("arrive filtré quand l'url le dit, et compte ce qui reste", async () => {
    const view = await mount({}, { filter: "NO_PLAN" });

    await view.findByText("Noah Fontaine");
    expect(view.queryByText("Léa Moreau")).toBeNull();
    expect(view.getByText("dashboard.table.matchCount")).toBeInTheDocument();
  });

  // Le compte redirait la tuile « Athlètes suivis », 300 px plus haut.
  it("ne compte pas les lignes d'une liste entière", async () => {
    const view = await mount();

    await view.findByText("Noah Fontaine");
    expect(view.queryByText("dashboard.table.matchCount")).toBeNull();
  });

  it("écrit la recherche et le filtre dans l'url, sans « Tous » qui est le défaut", async () => {
    const view = await mount();
    await view.findByText("Noah Fontaine");

    await view.user.type(view.getByLabelText("dashboard.table.searchLabel"), "no");
    await view.user.click(view.getByRole("button", { name: "dashboard.table.filter.NO_PLAN" }));
    expect(view.router.state.location.search).toMatchObject({ q: "no", filter: "NO_PLAN" });

    await view.user.click(view.getByRole("button", { name: "dashboard.table.filter.ALL" }));
    expect(view.router.state.location.search).not.toHaveProperty("filter");
  });

  it("efface la recherche de l'url plutôt que d'y laisser une chaîne vide", async () => {
    const view = await mount({}, { q: "n" });
    await view.findByText("Noah Fontaine");

    await view.user.clear(view.getByLabelText("dashboard.table.searchLabel"));

    expect(view.router.state.location.search).not.toHaveProperty("q");
  });

  /**
   * « Aucun athlète » et « aucun ne correspond » ne disent pas la même chose : confondre les deux
   * enverrait le coach inviter quelqu'un parce qu'il a mal tapé un nom.
   */
  it("propose de réinitialiser une recherche vide, jamais d'inviter", async () => {
    const view = await mount({}, { q: "zzz", filter: "ENDED_PLAN" });

    await view.user.click(
      await view.findByRole("button", { name: "dashboard.table.noMatch.reset" }),
    );

    expect(view.router.state.location.search).toEqual({});
    expect(await view.findByText("Léa Moreau")).toBeInTheDocument();
  });

  it("invite depuis l'écurie vide, sans barre de recherche à y promener", async () => {
    const view = await mount({ athletes: [] });

    const empty = await view.findByText("athlete.empty.title");
    expect(view.queryByLabelText("dashboard.table.searchLabel")).toBeNull();

    const section = empty.closest("section") as HTMLElement;
    await view.user.click(within(section).getByRole("button", { name: "athlete.invite" }));

    expect(await view.findByText("athlete.invitation.title")).toBeInTheDocument();
  });
});

/** La fiche ouverte vit dans l'URL (#121) : on y arrive d'ailleurs, et elle passe F5. */
describe("DashboardScreen — la fiche athlète", () => {
  it("s'ouvre depuis la ligne sans réinitialiser la barre du tableau", async () => {
    const view = await mount({}, { q: "léa" });

    await view.user.click(await view.findByRole("button", { name: "dashboard.table.openSheet" }));

    expect(view.router.state.location.search).toEqual({ q: "léa", athlete: "ath_lea" });
    expect(await view.findByRole("complementary", { name: "Léa Moreau" })).toBeInTheDocument();
  });

  it("s'ouvre par l'url, et se referme en la quittant", async () => {
    const view = await mount({}, { athlete: "ath_noah" });
    await view.findByRole("complementary", { name: "Noah Fontaine" });

    await view.user.keyboard("{Escape}");

    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    expect(view.queryByRole("complementary", { name: "Noah Fontaine" })).toBeNull();
  });

  // Un lien vers un athlète qui n'est plus dans la liste n'ouvre pas un panneau vide.
  it("n'ouvre rien pour un athlète qui n'est pas dans la liste", async () => {
    const view = await mount({}, { athlete: "ath_parti" });

    await view.findByText("Noah Fontaine");
    expect(view.queryByRole("complementary")).toBeNull();
  });

  it("invite depuis l'action de l'écran, et referme l'invitation", async () => {
    const view = await mount();

    await view.user.click(
      view.getAllByRole("button", { name: "athlete.invite" })[0] as HTMLElement,
    );

    expect(await view.findByText("athlete.invitation.title")).toBeInTheDocument();

    await view.user.keyboard("{Escape}");

    await waitFor(() => expect(view.queryByText("athlete.invitation.title")).toBeNull());
  });
});

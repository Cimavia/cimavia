import {
  notificationKeys,
  type ReminderDto,
  ReminderEntityType,
  ReminderReason,
  ReminderStatus,
  snoozedDueAt,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi } from "@/feature/reminder/api";
import { renderInRoute } from "../../../../test/render";
import { RemindersScreen } from "./RemindersScreen";

/**
 * Les VRAIS hooks de rappel, seul `api.ts` est bouchonné (« Tranché en #507 ») : ce qui s'éprouve
 * ici est ce qui part vers l'API, et ce que l'écran fait de sa réponse — y compris la seconde
 * invalidation, celle du centre de notifications, qu'un `mutate` espionné ne verrait pas.
 */
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/reminder/api")>();
  return {
    ...actual,
    reminderApi: {
      ...actual.reminderApi,
      list: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    },
  };
});
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({ title, children }: Readonly<{ title: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {children as never}
    </div>
  ),
}));

const reminder = (over: Partial<ReminderDto> & Pick<ReminderDto, "id">): ReminderDto => ({
  entityType: ReminderEntityType.PLAN,
  entityId: "pln_1",
  targetLabel: "Cycle bloc",
  dueAt: "2099-01-05T08:00:00.000Z",
  note: null,
  reason: null,
  status: ReminderStatus.PENDING,
  readAt: null,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
  ...over,
});

// Échéance lointaine : à traiter, pas encore due.
const ON_PLAN = reminder({ id: "r_plan", note: "Relancer Léa" });
// Auto-généré, sans note, échu depuis longtemps : le motif fait le titre, « en retard » prime.
const OVERDUE_INVOICE = reminder({
  id: "r_invoice",
  entityType: ReminderEntityType.INVOICE,
  entityId: "inv_1",
  targetLabel: "2026-03",
  dueAt: "2026-01-05T08:00:00.000Z",
  reason: ReminderReason.INVOICE_OVERDUE,
});
// Cible disparue, ni note ni motif : l'API ne le produit pas, l'écran n'invente rien pour autant.
const ORPHAN = reminder({ id: "r_orphan", targetLabel: null, status: ReminderStatus.DONE });
const DISMISSED = reminder({
  id: "r_dismissed",
  note: "Abandonné",
  status: ReminderStatus.DISMISSED,
});

const ALL = [ON_PLAN, OVERDUE_INVOICE, ORPHAN, DISMISSED];

// Une panne ne vaut que pour le premier appel : le réessai reçoit la liste entière.
async function mount(reminders: ReminderDto[] | Error = ALL) {
  vi.mocked(reminderApi.list).mockResolvedValue(reminders instanceof Error ? ALL : reminders);
  if (reminders instanceof Error) vi.mocked(reminderApi.list).mockRejectedValueOnce(reminders);
  const view = await renderInRoute(<RemindersScreen />, {
    path: "/reminders",
    links: ["/plans/$planId", "/invoices"],
  });
  await waitFor(() => expect(view.queryByText("common.loading")).not.toBeInTheDocument());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reminderApi.updateStatus).mockImplementation(async (id, { status }) =>
    reminder({ ...(ALL.find((item) => item.id === id) as ReminderDto), status }),
  );
});

describe("RemindersScreen — les états", () => {
  it("dit qu'il charge tant que la liste n'est pas arrivée", async () => {
    vi.mocked(reminderApi.list).mockReturnValue(new Promise(() => {}));

    const { getByText } = await renderInRoute(<RemindersScreen />, { path: "/reminders" });

    expect(getByText("common.loading")).toBeInTheDocument();
  });

  // « Aucun rappel » sur une panne réseau serait un mensonge : l'erreur a son propre état.
  it("dit la panne sans segments, puis relit la liste au réessai", async () => {
    const { user, getByRole, getByText, findByText, queryByRole } = await mount(
      new Error("réseau"),
    );

    expect(getByText("common.errorTitle")).toBeInTheDocument();
    expect(queryByRole("button", { name: "reminder.segment.PENDING" })).toBeNull();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(await findByText("Relancer Léa")).toBeInTheDocument();
    expect(reminderApi.list).toHaveBeenCalledTimes(2);
  });

  it("dit le vide de chaque segment avec son propre message", async () => {
    const { user, getByRole, getByText } = await mount([]);

    expect(getByText("reminder.empty.PENDING.title")).toBeInTheDocument();

    await user.click(getByRole("button", { name: "reminder.segment.HANDLED" }));

    expect(getByText("reminder.empty.HANDLED.title")).toBeInTheDocument();
  });
});

describe("RemindersScreen — la liste", () => {
  it("n'ouvre que les rappels à traiter, puis l'historique au changement de segment", async () => {
    const { user, getByRole, queryByText, getAllByRole } = await mount();

    expect(getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Relancer Léa",
      "reminder.reason.invoiceOverdue",
    ]);

    await user.click(getByRole("button", { name: "reminder.segment.HANDLED" }));

    // Ni note ni motif : « — », pas un texte fabriqué.
    expect(getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "—",
      "Abandonné",
    ]);
    expect(queryByText("Relancer Léa")).toBeNull();
    expect(getAllByRole("button", { name: "reminder.reopen" })).toHaveLength(2);
  });

  // « En retard » n'est pas stocké : un rappel à traiter dont l'échéance est passée.
  it("marque en retard le rappel échu, et à traiter celui qui ne l'est pas encore", async () => {
    const { getByText } = await mount();

    expect(getByText("reminder.state.pending")).toBeInTheDocument();
    expect(getByText("reminder.state.overdue")).toBeInTheDocument();
  });

  it("mène au cycle visé, et au suivi des factures émises pour une facture", async () => {
    const { getAllByRole } = await mount();

    const links = getAllByRole("link", { name: "reminder.targetLine" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/plans/pln_1",
      "/invoices?as=coach",
    ]);
  });

  // `targetLabel` à null : la cible a disparu (dette N-4). Un lien y serait un lien mort.
  it("tait le lien d'une cible disparue", async () => {
    const { user, getByRole, getByText, queryAllByRole } = await mount([ORPHAN]);

    await user.click(getByRole("button", { name: "reminder.segment.HANDLED" }));

    expect(getByText("reminder.targetLine")).toBeInTheDocument();
    expect(queryAllByRole("link")).toHaveLength(0);
  });
});

describe("RemindersScreen — les transitions", () => {
  it.each([
    ["reminder.markDone", ReminderStatus.DONE],
    ["reminder.dismiss", ReminderStatus.DISMISSED],
  ])("« %s » envoie %s, le dit, et périme aussi la cloche", async (label, status) => {
    const view = await mount();
    const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");

    await view.user.click(view.getAllByRole("button", { name: label })[0] as HTMLElement);

    expect(await view.findByRole("status")).toHaveTextContent(`reminder.toast.${status}`);
    expect(reminderApi.updateStatus).toHaveBeenCalledWith("r_plan", { status });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
    await waitFor(() => expect(reminderApi.list).toHaveBeenCalledTimes(2));
  });

  it("rouvre un rappel traité", async () => {
    const { user, getByRole, getAllByRole, findByRole } = await mount();
    await user.click(getByRole("button", { name: "reminder.segment.HANDLED" }));

    await user.click(getAllByRole("button", { name: "reminder.reopen" })[1] as HTMLElement);

    expect(await findByRole("status")).toHaveTextContent("reminder.toast.PENDING");
    expect(reminderApi.updateStatus).toHaveBeenCalledWith("r_dismissed", {
      status: ReminderStatus.PENDING,
    });
  });

  it("éteint les gestes pendant l'envoi", async () => {
    vi.mocked(reminderApi.updateStatus).mockReturnValue(new Promise(() => {}));
    const { user, getAllByRole } = await mount();

    await user.click(getAllByRole("button", { name: "reminder.markDone" })[0] as HTMLElement);

    for (const button of getAllByRole("button", { name: /reminder\.(markDone|dismiss)/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("dit l'échec de l'envoi", async () => {
    vi.mocked(reminderApi.updateStatus).mockRejectedValue(new Error("réseau"));
    const { user, getAllByRole, findByRole } = await mount();

    await user.click(getAllByRole("button", { name: "reminder.dismiss" })[0] as HTMLElement);

    expect(await findByRole("status")).toHaveTextContent("common.error");
  });
});

describe("RemindersScreen — repousser", () => {
  it("déplie les raccourcis, et se replie quand on se ravise", async () => {
    const { user, getAllByRole, getByRole, queryByRole } = await mount();

    await user.click(getAllByRole("button", { name: "reminder.snooze.label" })[0] as HTMLElement);
    expect(getByRole("button", { name: "reminder.snooze.TOMORROW" })).toBeInTheDocument();

    await user.click(getByRole("button", { name: "common.cancel" }));

    expect(queryByRole("button", { name: "reminder.snooze.TOMORROW" })).toBeNull();
    expect(reminderApi.update).not.toHaveBeenCalled();
  });

  // La nouvelle échéance est calculée ICI, dans le fuseau du lecteur, et part en instant absolu.
  it("envoie l'échéance repoussée d'une semaine, et nomme la nouvelle date", async () => {
    vi.mocked(reminderApi.update).mockImplementation(async (id, input) =>
      reminder({ ...ON_PLAN, id, dueAt: input.dueAt ?? ON_PLAN.dueAt }),
    );
    const { user, getAllByRole, getByRole, findByRole, queryByRole } = await mount();
    await user.click(getAllByRole("button", { name: "reminder.snooze.label" })[0] as HTMLElement);

    const before = new Date();
    await user.click(getByRole("button", { name: "reminder.snooze.NEXT_WEEK" }));
    const after = new Date();

    expect(await findByRole("status")).toHaveTextContent("reminder.toast.snoozed");
    const [id, input] = vi.mocked(reminderApi.update).mock.lastCall ?? [];
    expect(id).toBe("r_plan");
    const dueAt = input?.dueAt ?? "";
    expect(dueAt >= snoozedDueAt("NEXT_WEEK", before)).toBe(true);
    expect(dueAt <= snoozedDueAt("NEXT_WEEK", after)).toBe(true);
    expect(queryByRole("button", { name: "reminder.snooze.NEXT_WEEK" })).toBeNull();
  });
});

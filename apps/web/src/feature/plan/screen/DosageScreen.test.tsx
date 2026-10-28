import {
  type BlockGrid,
  CompositionOrigin,
  MetricKey,
  MetricSource,
  MetricUnit,
  MyAccessLevel,
  type PlanDto,
  PlanStatus,
  PlanWeekType,
  ProblemType,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  doseScheduledSession,
  getPlan,
  getScheduledSession,
  getScheduledSessionCopies,
} from "@/feature/plan/api";
import { DosageScreen } from "@/feature/plan/screen/DosageScreen";
import { ApiError } from "@/shared/lib/api";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  getPlan: vi.fn(),
  getScheduledSession: vi.fn(),
  getScheduledSessionCopies: vi.fn(),
  doseScheduledSession: vi.fn(),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
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

const SETTINGS = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const GRID: BlockGrid = {
  metrics: [
    {
      id: "reps",
      label: null,
      source: MetricSource.CATALOG,
      key: MetricKey.REPETITIONS,
      unit: MetricUnit.REPS,
    },
  ],
  rows: [{ id: "r0", values: { reps: 8 } }],
};

const blockOf = (rowId: string): ScheduledSessionBlockDto => ({
  id: "blk-1",
  name: "Séries",
  label: null,
  instructions: null,
  settings: SETTINGS,
  copiedSettings: SETTINGS,
  sourceStructureId: null,
  sourcePreset: StructurePresetKey.SERIES,
  baseline: {
    settings: SETTINGS,
    exercises: [{ key: "a", exerciseId: "ex-a", note: null, grid: GRID }],
  },
  tracking: null,
  exercises: [
    { id: rowId, key: "a", note: null, grid: GRID, origin: { kind: CompositionOrigin.RECEIVED } },
  ],
});

const copyOf = (id: string, planWeekId: string, updatedAt = "2026-09-01T10:00:00.000Z") =>
  ({
    id,
    planWeekId,
    scheduledDate: planWeekId === "pw-1" ? "2026-09-07" : "2026-09-14",
    updatedAt,
    status: ScheduledSessionStatus.PLANNED,
    blocks: [blockOf(`${id}-a`)],
    exercises: [
      { id: `${id}-a`, sourceExerciseId: "ex-a", title: "Tractions", tags: [], customMetrics: [] },
    ],
  }) as unknown as ScheduledSessionCopyDto;

const week = (id: string, weekNumber: number) => ({
  id,
  weekNumber,
  type: PlanWeekType.TRAINING,
  note: null,
  startDate: "2026-09-07",
  endDate: "2026-09-13",
  updatedAt: "2026-09-01T10:00:00.000Z",
  sessions: [],
});

const plan = (over: Partial<PlanDto> = {}) =>
  ({
    id: "pln_1",
    coachId: "coach_1",
    myAccess: { level: MyAccessLevel.OWNER, via: null },
    athleteId: "ath_lea",
    athleteName: "Léa Moreau",
    title: "Cycle force",
    status: PlanStatus.DRAFT,
    weeks: [week("pw-1", 1), week("pw-2", 2)],
    ...over,
  }) as unknown as PlanDto;

const SESSION = {
  id: "ss-1",
  sourceSessionId: "tpl-1",
  title: "Force",
} as unknown as ScheduledSessionDto;

const mount = () =>
  renderInRoute(<DosageScreen />, {
    path: "/plans/$planId_/dosage/$sessionId",
    params: { planId_: "pln_1", sessionId: "ss-1" },
    links: ["/plans/$planId"],
  });

/** Passe Tractions de S1 à 12 répétitions, dans le brouillon. */
async function editFirstCell(view: Awaited<ReturnType<typeof mount>>) {
  const row = (await view.findByRole("rowheader", { name: /Tractions/ })).closest("tr");
  const [cell] = within(row as HTMLElement).getAllByRole("button");
  await view.user.click(cell as HTMLElement);
  const [field] = within(view.getByRole("dialog")).getAllByRole("textbox");
  await view.user.clear(field as HTMLElement);
  await view.user.type(field as HTMLElement, "12");
  fireEvent.blur(field as HTMLElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlan).mockResolvedValue(plan());
  vi.mocked(getScheduledSession).mockResolvedValue(SESSION);
  vi.mocked(getScheduledSessionCopies).mockResolvedValue([
    copyOf("ss-1", "pw-1"),
    copyOf("ss-2", "pw-2"),
  ]);
});

describe("DosageScreen", () => {
  it("montre les semaines de la séance, sans rien à enregistrer", async () => {
    const view = await mount();

    expect(await view.findByRole("heading", { name: "Force" })).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
    expect(view.getByRole("link", { name: "plan.composition.viewSessionType" })).toHaveAttribute(
      "href",
      "/library/sessions/tpl-1",
    );
    expect(getScheduledSessionCopies).toHaveBeenCalledWith("ss-1");
  });

  it("enregistre en une requête ce qui a changé, puis repart de la réponse", async () => {
    const saved = { ...copyOf("ss-1", "pw-1", "2026-09-03T10:00:00.000Z") };
    vi.mocked(doseScheduledSession).mockResolvedValue([saved, copyOf("ss-2", "pw-2")]);
    const view = await mount();
    await editFirstCell(view);

    await view.user.click(view.getByRole("button", { name: "plan.dosage.save" }));

    await waitFor(() => expect(doseScheduledSession).toHaveBeenCalledTimes(1));
    const [sessionId, input] = vi.mocked(doseScheduledSession).mock.calls[0] ?? [];
    expect(sessionId).toBe("ss-1");
    // Seule S1 a bougé : S2 ne part pas.
    expect(input?.sessions.map((each) => each.id)).toEqual(["ss-1"]);
    expect(input?.sessions[0]?.expectedUpdatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(await view.findByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
  });

  it("garde la saisie sur un refus, et offre de recharger sur un conflit", async () => {
    vi.mocked(doseScheduledSession).mockRejectedValue(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = await mount();
    await editFirstCell(view);

    await view.user.click(view.getByRole("button", { name: "plan.dosage.save" }));
    expect(await view.findByText("plan.dosage.stale")).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();

    await view.user.click(view.getByRole("button", { name: "common.staleReload" }));
    await waitFor(() => expect(view.queryByText("plan.dosage.stale")).toBeNull());
    expect(getScheduledSessionCopies).toHaveBeenCalledTimes(2);
    // Le cycle avec : ses semaines font les colonnes.
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(view.getByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
  });

  it("règle les tours d'une semaine, et l'en rend à la séance-type", async () => {
    const view = await mount();
    const row = (
      await view.findByRole("rowheader", { name: "plan.dosage.setting.ROUNDS" })
    ).closest("tr") as HTMLElement;
    await view.user.click(within(row).getAllByRole("button")[0] as HTMLElement);
    const field = view.getByRole("textbox", { name: "plan.dosage.setting.ROUNDS" });
    await view.user.clear(field);
    await view.user.type(field, "5");
    fireEvent.blur(field);
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();

    const [w1Menu] = view.getAllByRole("button", { name: "plan.dosage.columnActions" });
    await view.user.click(w1Menu as HTMLElement);
    await view.user.click(
      view.getByRole("menuitem", { name: "plan.composition.backToSessionType" }),
    );

    expect(view.getByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
  });

  it("retient la sortie tant qu'une saisie n'est pas enregistrée", async () => {
    const view = await mount();
    await editFirstCell(view);

    await view.user.click(view.getByRole("link", { name: "plan.builder.titleWithAthlete" }));

    expect(await view.findByRole("dialog", { name: /common\.leave/ })).toBeTruthy();
    expect(view.router.state.location.pathname).toBe("/plans/pln_1/dosage/ss-1");
  });

  it("rouvre le cycle sur le panneau d'une semaine", async () => {
    const view = await mount();
    const [, w2Menu] = await view.findAllByRole("button", { name: "plan.dosage.columnActions" });

    await view.user.click(w2Menu as HTMLElement);
    await view.user.click(view.getByRole("menuitem", { name: "plan.dosage.compose" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/plans/pln_1"));
    expect(view.router.state.location.search).toEqual({ session: "ss-2" });
  });

  it("se lit sans s'enregistrer sur le cycle d'un autre, et prévient d'un cycle diffusé", async () => {
    vi.mocked(getPlan).mockResolvedValue(
      plan({
        myAccess: { level: MyAccessLevel.READ, via: null },
        status: PlanStatus.PUBLISHED,
      } as Partial<PlanDto>),
    );
    const view = await mount();

    expect(await view.findByText("plan.composition.willSeeUpdate")).toBeTruthy();
    expect(view.queryByRole("button", { name: /plan\.dosage\.save/ })).toBeNull();
  });

  it("dit une panne de lecture, et relit sur demande", async () => {
    vi.mocked(getScheduledSessionCopies).mockRejectedValueOnce(new Error("panne"));
    const view = await mount();

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    expect(await view.findByRole("heading", { name: "Force" })).toBeTruthy();
  });
});

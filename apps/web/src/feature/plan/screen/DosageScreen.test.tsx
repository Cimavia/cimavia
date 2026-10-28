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
  ScheduledSessionStatus,
  STRUCTURE_PRESETS,
  StructureOrder,
  StructurePresetKey,
  StructureRepeat,
  type StructureSettings,
} from "@cmv/shared";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doseScheduledSession, getPlan, getScheduledSessionCopies } from "@/feature/plan/api";
import { DosageScreen } from "@/feature/plan/screen/DosageScreen";
import { ApiError } from "@/shared/lib/api";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  getPlan: vi.fn(),
  getScheduledSessionCopies: vi.fn(),
  doseScheduledSession: vi.fn(),
}));
// Le client des tests oublie tout à la fin d'une lecture (`gcTime: 0`) : ici, les copies restent en
// cache, comme dans l'application — c'est ce que Dosage ne doit pas croire sur parole.
vi.mock("@/feature/plan/hook/usePlan", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/feature/plan/hook/usePlan")>();
  return {
    ...real,
    scheduledSessionCopiesQuery: (id: string) => ({
      ...real.scheduledSessionCopiesQuery(id),
      gcTime: Number.POSITIVE_INFINITY,
    }),
  };
});
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

const received = (id: string, key: string) => ({
  id,
  key,
  note: null,
  grid: GRID,
  origin: { kind: CompositionOrigin.RECEIVED },
});

/** Un bloc de Tractions (`a`) — ou, sous d'autres réglages, de Tractions et Gainage (`b`). */
const blockOf = (
  copyId: string,
  settings: StructureSettings = SETTINGS,
): ScheduledSessionBlockDto => {
  const keys = settings === SETTINGS ? ["a"] : ["a", "b"];
  return {
    id: "blk-1",
    name: "Séries",
    label: null,
    instructions: null,
    settings,
    copiedSettings: settings,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    baseline: {
      settings,
      exercises: keys.map((key) => ({ key, exerciseId: `ex-${key}`, note: null, grid: GRID })),
    },
    tracking: null,
    exercises: keys.map((key) => received(`${copyId}-${key}`, key)),
  } as ScheduledSessionBlockDto;
};

const copyOf = (
  id: string,
  planWeekId: string,
  updatedAt = "2026-09-01T10:00:00.000Z",
  settings: StructureSettings = SETTINGS,
) =>
  ({
    id,
    planWeekId,
    scheduledDate: planWeekId === "pw-1" ? "2026-09-07" : "2026-09-14",
    updatedAt,
    status: ScheduledSessionStatus.PLANNED,
    blocks: [blockOf(id, settings)],
    exercises: [
      { id: `${id}-a`, sourceExerciseId: "ex-a", title: "Tractions", tags: [], customMetrics: [] },
      { id: `${id}-b`, sourceExerciseId: "ex-b", title: "Gainage", tags: [], customMetrics: [] },
    ],
  }) as unknown as ScheduledSessionCopyDto;

const placed = (id: string, sourceSessionId: string, title: string, position = 0) => ({
  id,
  sourceSessionId,
  title,
  scheduledDate: "2026-09-07",
  position,
  blockCount: 1,
});

/** Force en S1 et S2 ; Souplesse en S1 seulement. */
const week = (id: string, weekNumber: number) => ({
  id,
  weekNumber,
  type: PlanWeekType.TRAINING,
  note: null,
  startDate: "2026-09-07",
  endDate: "2026-09-13",
  updatedAt: "2026-09-01T10:00:00.000Z",
  sessions:
    weekNumber === 1
      ? [placed("ss-1", "tpl-1", "Force"), placed("ss-9", "tpl-2", "Souplesse", 1)]
      : [placed("ss-2", "tpl-1", "Force")],
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

const mount = (search: Record<string, string> = {}) =>
  renderInRoute(<DosageScreen />, {
    path: "/plans/$planId_/dosage",
    params: { planId_: "pln_1" },
    links: ["/plans/$planId"],
    search,
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
  vi.mocked(getScheduledSessionCopies).mockResolvedValue([
    copyOf("ss-1", "pw-1"),
    copyOf("ss-2", "pw-2"),
  ]);
});

describe("DosageScreen", () => {
  it("ouvre la première séance-type du cycle, sans rien à enregistrer", async () => {
    const view = await mount();

    expect(await view.findByRole("heading", { name: "Force" })).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
    expect(view.getByRole("link", { name: "plan.composition.viewSessionType" })).toHaveAttribute(
      "href",
      "/library/sessions/tpl-1",
    );
    expect(getScheduledSessionCopies).toHaveBeenCalledWith("ss-1");
    const picker = view.getByRole("combobox", { name: "plan.dosage.sessionType" });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((each) => each.textContent),
    ).toEqual(["Force", "Souplesse"]);
  });

  it("ouvre la séance-type que l'adresse nomme, et passe à une autre", async () => {
    const view = await mount({ type: "tpl-2" });
    expect(await view.findByRole("heading", { name: "Souplesse" })).toBeTruthy();
    expect(getScheduledSessionCopies).toHaveBeenCalledWith("ss-9");

    await view.user.selectOptions(
      view.getByRole("combobox", { name: "plan.dosage.sessionType" }),
      "tpl-1",
    );

    expect(await view.findByRole("heading", { name: "Force" })).toBeTruthy();
    expect(view.router.state.location.search).toEqual({ type: "tpl-1" });
    expect(getScheduledSessionCopies).toHaveBeenLastCalledWith("ss-1");
  });

  it("demande avant de changer de séance-type sur une saisie non enregistrée", async () => {
    const view = await mount();
    await editFirstCell(view);

    await view.user.selectOptions(
      view.getByRole("combobox", { name: "plan.dosage.sessionType" }),
      "tpl-2",
    );
    const dialog = await view.findByRole("dialog", { name: /common\.leave/ });
    await view.user.click(within(dialog).getByRole("button", { name: "common.leave.cancel" }));

    expect(view.router.state.location.search).toEqual({});
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();
  });

  it("relit les copies à chaque ouverture, et n'ouvre pas sur celles du cache si ça échoue", async () => {
    const view = await mount();
    await view.findByRole("heading", { name: "Force" });
    const picker = () => view.getByRole("combobox", { name: "plan.dosage.sessionType" });
    await view.user.selectOptions(picker(), "tpl-2");
    await view.findByRole("heading", { name: "Souplesse" });
    vi.mocked(getScheduledSessionCopies).mockRejectedValueOnce(new Error("panne"));

    await view.user.selectOptions(picker(), "tpl-1");

    expect(await view.findByRole("button", { name: "common.retry" })).toBeTruthy();
    expect(vi.mocked(getScheduledSessionCopies).mock.calls.map(([id]) => id)).toEqual([
      "ss-1",
      "ss-9",
      "ss-1",
    ]);
  });

  it("garde la saisie quand le cycle relu met une autre copie en tête", async () => {
    const view = await mount();
    await editFirstCell(view);
    // S1 n'a plus Force : sa première copie est désormais celle de S2.
    const moved = plan();
    moved.weeks = moved.weeks.map((each) =>
      each.weekNumber === 1
        ? { ...each, sessions: each.sessions.filter(({ id }) => id !== "ss-1") }
        : each,
    );
    vi.mocked(getPlan).mockResolvedValue(moved);

    await view.queryClient.refetchQueries();

    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();
  });

  it("dit qu'il n'y a rien à doser sans séance par blocs, et ramène au cycle", async () => {
    vi.mocked(getPlan).mockResolvedValue(plan({ weeks: [] } as Partial<PlanDto>));
    const view = await mount();

    expect(await view.findByText("plan.dosage.empty.title")).toBeTruthy();
    expect(view.getByRole("link", { name: "plan.dosage.back" })).toHaveAttribute(
      "href",
      "/plans/pln_1",
    );
    expect(getScheduledSessionCopies).not.toHaveBeenCalled();
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

  it("garde la saisie et le dit, si la relecture échoue", async () => {
    vi.mocked(doseScheduledSession).mockRejectedValue(
      new ApiError(409, "Conflit", null, true, ProblemType.STALE_WRITE),
    );
    const view = await mount();
    await editFirstCell(view);
    await view.user.click(view.getByRole("button", { name: "plan.dosage.save" }));
    await view.findByText("plan.dosage.stale");
    vi.mocked(getScheduledSessionCopies).mockRejectedValueOnce(new Error("panne"));

    await view.user.click(view.getByRole("button", { name: "common.staleReload" }));

    expect(await view.findByText("common.error")).toBeTruthy();
    expect(view.getByText("plan.dosage.stale")).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();
  });

  it("n'enregistre pas des tours trop courts pour les exercices du bloc, et dit où", async () => {
    // Un exercice par bip, deux exercices : deux tours au moins.
    const emom = {
      ...STRUCTURE_PRESETS[StructurePresetKey.EMOM],
      order: StructureOrder.ONE,
      repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 },
    } as StructureSettings;
    vi.mocked(getScheduledSessionCopies).mockResolvedValue([
      copyOf("ss-1", "pw-1", undefined, emom),
    ]);
    const view = await mount();
    const row = (
      await view.findByRole("rowheader", { name: "plan.dosage.setting.ROUNDS" })
    ).closest("tr") as HTMLElement;
    await view.user.click(within(row).getAllByRole("button")[0] as HTMLElement);
    const field = view.getByRole("textbox", { name: "plan.dosage.setting.ROUNDS" });
    await view.user.clear(field);
    await view.user.type(field, "1");
    fireEvent.blur(field);

    expect(await view.findByText("plan.dosage.roundsIssue")).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeDisabled();
  });

  it("règle les tours d'une semaine, et l'en rend à la séance-type, cellule ou colonne", async () => {
    const view = await mount();
    const row = (await view.findByRole("rowheader", { name: "plan.dosage.setting.SETS" })).closest(
      "tr",
    ) as HTMLElement;
    await view.user.click(within(row).getAllByRole("button")[0] as HTMLElement);
    const field = view.getByRole("textbox", { name: "plan.dosage.setting.SETS" });
    await view.user.clear(field);
    await view.user.type(field, "5");
    fireEvent.blur(field);
    expect(view.getByRole("button", { name: "plan.dosage.save" })).toBeEnabled();

    // Le bouton disparaît sous son propre clic : la fenêtre n'y lit pas un clic ailleurs.
    await view.user.click(
      within(view.getByRole("dialog")).getByRole("button", {
        name: "plan.composition.backToSessionType",
      }),
    );
    expect(view.getByRole("dialog")).toBeTruthy();
    expect(view.getByRole("button", { name: "plan.dosage.saved" })).toBeDisabled();
    await view.user.clear(field);
    await view.user.type(field, "5");
    fireEvent.blur(field);
    await view.user.keyboard("{Escape}");

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

    await view.user.click(view.getByRole("link", { name: "plan.dosage.back" }));

    expect(await view.findByRole("dialog", { name: /common\.leave/ })).toBeTruthy();
    expect(view.router.state.location.pathname).toBe("/plans/pln_1/dosage");
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

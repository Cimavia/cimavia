import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPlanWeek,
  copyPlanWeek,
  createPlan,
  createScheduledSession,
  deletePlan,
  deletePlanWeek,
  deleteScheduledSession,
  getPlan,
  getScheduledSession,
  listPlans,
  planKeys,
  publishPlan,
  reorderPlanDay,
  scheduledSessionKeys,
  updatePlan,
  updatePlanWeek,
  updateScheduledSession,
} from "./api";

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Le client HTTP est la frontière : verbe, chemin et corps sont tout ce que ce module décide.
vi.mock("@/shared/lib/api", () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(apiMock)) fn.mockResolvedValue("réponse");
});

describe("planKeys et scheduledSessionKeys", () => {
  it("garde les clés de cycle sous une racine commune, invalidée d'un seul geste", () => {
    for (const key of [planKeys.list(), planKeys.detail("p-1")]) {
      expect(key.slice(0, 1)).toEqual(planKeys.all);
    }
  });

  // Mêmes clés = cache écrasé : une séance planifiée n'est pas un cycle.
  it("range une séance planifiée hors de la racine des cycles", () => {
    expect(scheduledSessionKeys.detail("s-1").slice(0, 1)).toEqual(scheduledSessionKeys.all);
    expect(scheduledSessionKeys.all).not.toEqual(planKeys.all);
  });
});

/**
 * Une ligne par fonction. Le verbe est ce qui se casse en silence : la séance est un REMPLACEMENT
 * intégral (PUT), l'en-tête une modification partielle (PATCH), et l'ordre d'une journée une
 * permutation complète (PUT) — `tsc` ne distingue aucun des trois.
 */
describe.each([
  ["listPlans", () => listPlans(), "get", ["/plans"]],
  ["getPlan", () => getPlan("p-1"), "get", ["/plans/p-1"]],
  [
    "createPlan",
    () => createPlan({ title: "Bloc" } as never),
    "post",
    ["/plans", { title: "Bloc" }],
  ],
  [
    "updatePlan",
    () => updatePlan("p-1", { title: "Bloc" }),
    "patch",
    ["/plans/p-1", { title: "Bloc" }],
  ],
  ["deletePlan", () => deletePlan("p-1"), "delete", ["/plans/p-1"]],
  ["publishPlan", () => publishPlan("p-1"), "post", ["/plans/p-1/publish"]],
  [
    "addPlanWeek",
    () => addPlanWeek("p-1", { type: "TRAINING" } as never),
    "post",
    ["/plans/p-1/weeks", { type: "TRAINING" }],
  ],
  [
    "updatePlanWeek",
    () => updatePlanWeek("w-1", { note: "Décharge" } as never),
    "patch",
    ["/plan-weeks/w-1", { note: "Décharge" }],
  ],
  ["deletePlanWeek", () => deletePlanWeek("w-1"), "delete", ["/plan-weeks/w-1"]],
  [
    "copyPlanWeek",
    () => copyPlanWeek("w-cible", { sourcePlanWeekId: "w-source" }),
    "post",
    ["/plan-weeks/w-cible/copy-from", { sourcePlanWeekId: "w-source" }],
  ],
  [
    "reorderPlanDay",
    () => reorderPlanDay("w-1", "2026-10-05", { sessionIds: ["s-2", "s-1"] }),
    "put",
    ["/plan-weeks/w-1/days/2026-10-05/order", { sessionIds: ["s-2", "s-1"] }],
  ],
  [
    "createScheduledSession",
    () => createScheduledSession("w-1", { title: "Force" } as never),
    "post",
    ["/plan-weeks/w-1/sessions", { title: "Force" }],
  ],
  [
    "updateScheduledSession",
    () => updateScheduledSession("s-1", { title: "Force" } as never),
    "put",
    ["/scheduled-sessions/s-1", { title: "Force" }],
  ],
  ["getScheduledSession", () => getScheduledSession("s-1"), "get", ["/scheduled-sessions/s-1"]],
  [
    "deleteScheduledSession",
    () => deleteScheduledSession("s-1"),
    "delete",
    ["/scheduled-sessions/s-1"],
  ],
] as const)("%s", (_, call, verb, args) => {
  it(`part en ${verb.toUpperCase()} sur la bonne ressource`, async () => {
    await expect(call()).resolves.toBe("réponse");

    expect(apiMock[verb]).toHaveBeenCalledWith(...args);
  });
});

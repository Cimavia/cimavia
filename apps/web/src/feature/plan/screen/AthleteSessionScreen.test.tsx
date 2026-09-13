import type { ScheduledSessionDto } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { AthleteSessionScreen } from "./AthleteSessionScreen";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  athletePlanApi: { session: getSessionMock },
}));

const SESSION_ID = "ss-1";
const MONDAY = "2026-10-12";
const OPEN_FEEDBACK = "feedback.open";

/** Une séance d'un exercice : sans exercice, le rail RETIRE le bouton de débrief. */
const session = (): ScheduledSessionDto =>
  ({
    id: SESSION_ID,
    title: "Séance haute",
    notes: null,
    scheduledDate: "2026-10-14",
    status: ScheduledSessionStatus.PLANNED,
    exercises: [
      {
        id: "sx-1",
        title: "Traction",
        instructions: null,
        tags: [],
        documents: [],
        tracking: null,
        blocks: [{ id: "b-1", label: null, structure: { type: "FREE" }, metrics: [], rows: [] }],
      },
    ],
  }) as unknown as ScheduledSessionDto;

/**
 * L'écran est monté sous l'id EXACT que réclame son `getRouteApi` — la feuille `.index`, avec sa
 * barre finale —, et avec l'URL de départ qu'on lui donne : c'est elle qui porte la semaine du
 * planning d'où l'athlète est venu (#251).
 */
const setup = (search: Record<string, string> = {}) =>
  renderInRoute(<AthleteSessionScreen />, {
    path: "/sessions/$sessionId/",
    params: { sessionId: SESSION_ID },
    search,
    links: ["/planning", "/my-coach", "/sessions/$sessionId/feedback"],
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(session());
});

afterEach(() => {
  // `useLocalTracking` lit le stockage du navigateur : un test laisserait ses coches au suivant.
  window.localStorage.clear();
});

describe("AthleteSessionScreen", () => {
  /**
   * La semaine du planning TRAVERSE le débrief : perdue à cette étape, le retour au planning ne
   * saurait plus où ramener l'athlète qui est passé par lui.
   */
  it("emporte la semaine du planning vers le débrief", async () => {
    const { findByRole, router, user } = await setup({ from: MONDAY });

    await user.click(await findByRole("button", { name: OPEN_FEEDBACK }));

    expect(router.state.location.href).toBe(`/sessions/${SESSION_ID}/feedback?from=${MONDAY}`);
  });

  // Arrivé d'ailleurs que du planning, il n'y a aucune semaine à transmettre — et on n'en invente pas.
  it("n'invente aucune semaine quand on n'en apporte pas", async () => {
    const { findByRole, router, user } = await setup();

    await user.click(await findByRole("button", { name: OPEN_FEEDBACK }));

    expect(router.state.location.href).toBe(`/sessions/${SESSION_ID}/feedback`);
  });
});

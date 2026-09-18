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
const BACK = "plan.athlete.backToPlanning";

/** Une séance d'un exercice — le cas ordinaire, dont le rail tire son sommaire. */
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
 * Une séance SANS exercice : « footing, repos actif » se compose exactement comme ça, et rien dans
 * le schéma partagé ne l'interdit. Le jeu de données manquait — d'où #276, qui n'aurait pas pu
 * arriver si ce cas avait été monté une fois.
 */
const emptySession = (): ScheduledSessionDto =>
  ({ ...session(), title: "Footing, repos actif", exercises: [] }) as ScheduledSessionDto;

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
   * Le cœur de #251 : l'athlète qui préparait sa semaine suivante retombait sur la semaine par
   * défaut après chaque séance. Le retour rouvre la semaine d'où il vient — pas celle de la séance.
   */
  it("ramène au planning sur la semaine qu'on regardait", async () => {
    const { findByRole } = await setup({ from: MONDAY });

    expect(await findByRole("link", { name: BACK })).toHaveAttribute(
      "href",
      `/planning?from=${MONDAY}`,
    );
  });

  // Arrivé par la liste, un message ou une notification : aucune semaine d'origine, donc le défaut.
  it("ramène au planning par défaut quand on n'arrive pas du planning", async () => {
    const { findByRole } = await setup();

    expect(await findByRole("link", { name: BACK })).toHaveAttribute("href", "/planning");
  });

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

  // Le témoin du cas suivant : sans lui, « ferme le sommaire » passerait sur un rail qui ne le
  // monte jamais.
  it("monte le sommaire du rail sur une séance composée", async () => {
    const { findByText } = await setup();

    expect(await findByText("plan.athlete.summary")).toBeInTheDocument();
  });

  /**
   * #276 : le rail RETIRAIT le bouton sur une séance sans exercice, au motif que l'anomalie était
   * celle du coach. Or le débrief est le seul geste qui reste à l'athlète — c'est par lui qu'il
   * envoie sa trace —, et rien côté serveur n'y a jamais fait obstacle.
   */
  describe("sur une séance sans exercice", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(emptySession());
    });

    it("garde le bouton de débrief", async () => {
      const { findByRole } = await setup();

      expect(await findByRole("button", { name: OPEN_FEEDBACK })).toBeInTheDocument();
    });

    it("mène au débrief, la semaine du planning avec lui", async () => {
      const { findByRole, router, user } = await setup({ from: MONDAY });

      await user.click(await findByRole("button", { name: OPEN_FEEDBACK }));

      expect(router.state.location.href).toBe(`/sessions/${SESSION_ID}/feedback?from=${MONDAY}`);
    });

    // Seul le SOMMAIRE dépend de la composition : sans exercice, il n'y a rien à sommer.
    it("ferme le sommaire du rail, qui n'aurait rien à sommer", async () => {
      const { findByRole, queryByText } = await setup();
      await findByRole("button", { name: OPEN_FEEDBACK });

      expect(queryByText("plan.athlete.summary")).not.toBeInTheDocument();
    });

    // On constate le vide sans désigner de coupable — l'écran ne dit plus « ton coach a oublié ».
    it("constate l'absence de déroulé", async () => {
      const { findByText } = await setup();

      expect(await findByText("plan.athlete.emptyTitle")).toBeInTheDocument();
    });
  });
});

import type { ScheduledSessionDto } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { blockSession } from "@cmv/shared/test/block-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { AthleteSessionScreen } from "./AthleteSessionScreen";

const { getSessionMock, selfId } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selfId: { current: "ath_1" },
}));

// Le compte courant décide si la séance a un coach à qui écrire, ou s'il se l'est programmée.
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: selfId.current } } }) },
}));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  athletePlanApi: { session: getSessionMock },
}));

const SESSION_ID = "ss-1";
const MONDAY = "2026-10-12";
const COACH_ID = "coach_m";
const CONTACT = "plan.athlete.contactCoach";
const OPEN_FEEDBACK = "feedback.open";
const BACK = "plan.athlete.backToPlanning";

/** Une séance par blocs — le cas ordinaire. */
const session = (): ScheduledSessionDto =>
  blockSession({
    id: SESSION_ID,
    title: "Séance haute",
    coachId: COACH_ID,
    coachName: "Marc Keller",
  });

/**
 * Une séance SANS exercice : « footing, repos actif » se compose exactement comme ça, et rien dans
 * le schéma partagé ne l'interdit. Le jeu de données manquait — d'où #276, qui n'aurait pas pu
 * arriver si ce cas avait été monté une fois.
 */
const emptySession = (): ScheduledSessionDto => ({
  ...session(),
  title: "Footing, repos actif",
  exercises: [],
  blocks: [],
});

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
    links: ["/planning", "/messages", "/sessions/$sessionId/feedback"],
  });

beforeEach(() => {
  vi.clearAllMocks();
  selfId.current = "ath_1";
  getSessionMock.mockResolvedValue(session());
});

afterEach(() => {
  // `useLocalBlockTracking` lit le stockage du navigateur : un test laisserait ses coches au suivant.
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

    // On constate le vide sans désigner de coupable — l'écran ne dit plus « ton coach a oublié ».
    it("constate l'absence de déroulé", async () => {
      const { findByText } = await setup();

      expect(await findByText("plan.athlete.emptyTitle")).toBeInTheDocument();
    });
  });

  // Le retour ne dépend pas de la séance : on peut quitter avant qu'elle soit lue (#746).
  it("ramène au planning pendant que la séance se charge", async () => {
    getSessionMock.mockReturnValue(new Promise(() => undefined));
    const { getByRole, getByText } = await setup({ from: MONDAY });

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(getByRole("link", { name: BACK })).toHaveAttribute("href", `/planning?from=${MONDAY}`);
  });

  it("offre de réessayer une séance qui n'a pas pu se charger", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("réseau"));
    const { findByRole, findByText, getByRole, user } = await setup({ from: MONDAY });

    const retry = await findByRole("button", { name: "common.retry" });
    // Dans le bandeau, le retour ne dépend plus de la séance : en panne aussi, on rentre (#746).
    expect(getByRole("link", { name: BACK })).toHaveAttribute("href", `/planning?from=${MONDAY}`);
    await user.click(retry);

    // Le rejeu relit la séance : elle s'affiche, l'erreur s'efface.
    expect(await findByText("plan.athlete.blocks.count")).toBeInTheDocument();
    expect(getSessionMock).toHaveBeenCalledTimes(2);
  });

  /**
   * Le fil du coach DE CETTE SÉANCE (#599) : un athlète suivi par plusieurs coachs écrit à celui
   * qui l'a programmée, pas à un coach « principal » qui n'existe plus.
   */
  it("ouvre le fil du coach qui a programmé la séance", async () => {
    const { findByRole } = await setup();

    expect(await findByRole("link", { name: CONTACT })).toHaveAttribute(
      "href",
      `/messages?coach=${COACH_ID}&as=athlete`,
    );
  });

  // Une séance qu'il s'est programmée lui-même : personne à qui écrire, donc aucun lien.
  it("n'offre pas d'écrire à soi-même sur une séance auto-coachée", async () => {
    selfId.current = COACH_ID;
    const { findByText, queryByRole } = await setup();

    expect(await findByText("plan.athlete.blocks.count")).toBeInTheDocument();
    expect(queryByRole("link", { name: CONTACT })).toBeNull();
  });

  // Le libellé suit le STATUT : « débriefer » sur une séance débriefée ferait craindre d'écraser.
  it("dit que le débrief existe déjà, et montre les notes du coach", async () => {
    getSessionMock.mockResolvedValue({
      ...session(),
      status: ScheduledSessionStatus.DONE,
      notes: "Écoute tes doigts",
    });
    const { findByRole, getByText } = await setup();

    expect(await findByRole("button", { name: "feedback.openDone" })).toBeInTheDocument();
    expect(getByText("Écoute tes doigts")).toBeInTheDocument();
  });

  /** #722 : une séance composée par blocs se lit bloc par bloc, et se coche dans le rail. */
  describe("une séance par blocs", () => {
    const stored = () =>
      JSON.parse(window.localStorage.getItem(`cimavia-block-tracking:${SESSION_ID}`) ?? "null");

    beforeEach(() => {
      getSessionMock.mockResolvedValue(blockSession({ id: SESSION_ID, coachId: COACH_ID }));
    });

    it("lit la séance bloc par bloc", async () => {
      const { findByText, getByText } = await setup();

      expect(await findByText("plan.athlete.blocks.count")).toBeInTheDocument();
      expect(getByText("plan.athlete.blocks.title")).toBeInTheDocument();
      expect(getByText("plan.athlete.blocks.sent")).toBeInTheDocument();
    });

    it("ouvre « Mon suivi » du bloc choisi dans le rail, et garde la coche en local", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const { findAllByRole, findByText, queryByText, user } = await setup();
      expect(await findByText("plan.athlete.blocks.choose")).toBeInTheDocument();

      const [first] = await findAllByRole("button", { name: "plan.athlete.blocks.tracking" });
      await user.click(first as HTMLElement);
      expect(queryByText("plan.athlete.blocks.choose")).not.toBeInTheDocument();
      // Sous `xl`, le rail est sous les blocs : le panneau vient à l'écran, le focus avec lui.
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "plan.athlete.blocks.tracking",
      );

      const [box] = await findAllByRole("button", { pressed: false });
      await user.click(box as HTMLElement);

      expect(stored()).toMatchObject({ "blk-1": { checked: [{ key: "a1", row: 0 }] } });
    });
  });
});

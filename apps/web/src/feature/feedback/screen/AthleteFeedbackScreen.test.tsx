import type { ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { AthleteFeedbackScreen } from "./AthleteFeedbackScreen";

const { getFeedbackMock, upsertMock, getSessionMock } = vi.hoisted(() => ({
  getFeedbackMock: vi.fn(),
  upsertMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("@/feature/feedback/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/feedback/api")>()),
  athleteFeedbackApi: { get: getFeedbackMock, upsert: upsertMock },
}));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  athletePlanApi: { session: getSessionMock },
}));

/**
 * Les médias sont coupés au niveau du HOOK et non de l'API : leur flux (URL signée, XHR, quotas)
 * est une feature à part entière, avec ses propres refus à vérifier. Le monter ici ne testerait
 * pas le débrief, il rendrait ses échecs illisibles.
 */
vi.mock("@/feature/feedback/hook/useMyFeedbackMedia", () => ({
  useAddFeedbackMedia: () => ({
    addFile: vi.fn(),
    addAudio: vi.fn(),
    isUploading: false,
    error: null,
    progress: 0,
  }),
  useDeleteFeedbackMedia: () => ({ mutate: vi.fn(), isPending: false }),
}));

/**
 * `MediaRecorder` n'existe pas dans jsdom, et `pickRecorderMimeType` l'appelle SANS garde — le
 * rendu de l'écran lève alors un `ReferenceError`. Ce stub décrit un navigateur qui possède
 * l'API mais ne sait produire aucun format accepté par le débrief : c'est le cas Firefox, celui
 * pour lequel `isAvailable` a été écrit.
 *
 * Il ne couvre donc PAS le navigateur qui n'a pas l'API du tout (Safari iOS ancien), où l'écran
 * casse aujourd'hui pour de bon.
 */
vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });

const SESSION_ID = "ss-1";
const ROUTE = "/sessions/$sessionId/feedback";
const CONTENT = "feedback.contentLabel";
const SUBMIT = "feedback.submit.action";

const session = (): ScheduledSessionDto =>
  ({
    id: SESSION_ID,
    title: "Séance haute",
    exercises: [
      {
        id: "sx-1",
        title: "Traction",
        tracking: null,
        blocks: [{ id: "b-1", label: null, structure: { type: "FREE" }, metrics: [], rows: [] }],
      },
    ],
  }) as unknown as ScheduledSessionDto;

const feedback = (over: Partial<SessionFeedbackDto> = {}): SessionFeedbackDto =>
  ({ id: "fb-1", content: null, media: [], ...over }) as unknown as SessionFeedbackDto;

function setup() {
  return renderInRoute(<AthleteFeedbackScreen />, {
    path: ROUTE,
    params: { sessionId: SESSION_ID },
    links: [`/sessions/$sessionId`],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `useLocalTracking` lit le stockage du navigateur : un test laisserait sinon ses coches au
  // suivant, qui décrirait une séance déjà remplie sans l'avoir demandé.
  window.localStorage.clear();
  getSessionMock.mockResolvedValue(session());
  getFeedbackMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue(feedback());
});

afterEach(() => {
  window.localStorage.clear();
});

describe("AthleteFeedbackScreen", () => {
  describe("le chargement", () => {
    it("dit qu'il charge avant de montrer un formulaire", async () => {
      const { getByText } = await setup();

      expect(getByText("common.loading")).toBeInTheDocument();
    });

    it("propose de réessayer quand le débrief ne se charge pas", async () => {
      getFeedbackMock.mockRejectedValue(new Error("réseau"));
      const { findByText } = await setup();

      // L'écriture exige le réseau : l'échec est DIT, pas masqué par un formulaire vide qui
      // laisserait croire qu'il n'y a rien à reprendre.
      expect(await findByText("common.errorTitle")).toBeInTheDocument();
    });
  });

  describe("ce qui autorise l'envoi", () => {
    it("laisse partir un premier débrief vide", async () => {
      const { findByRole } = await setup();

      // « J'ai fait la séance, rien à dire » est une réponse : forcer du texte n'en produit que
      // de creux.
      expect(await findByRole("button", { name: SUBMIT })).toBeEnabled();
    });

    it("ferme l'envoi sur un débrief déjà enregistré et inchangé", async () => {
      getFeedbackMock.mockResolvedValue(feedback({ content: "Bonne séance" }));
      const { findByRole } = await setup();

      expect(await findByRole("button", { name: SUBMIT })).toBeDisabled();
    });

    it("rouvre l'envoi dès que le texte change", async () => {
      getFeedbackMock.mockResolvedValue(feedback({ content: "Bonne séance" }));
      const { user, findByLabelText, getByRole } = await setup();

      await user.type(await findByLabelText(CONTENT), " et longue");

      expect(getByRole("button", { name: SUBMIT })).toBeEnabled();
    });

    it("part du texte déjà enregistré", async () => {
      getFeedbackMock.mockResolvedValue(feedback({ content: "Bonne séance" }));
      const { findByLabelText } = await setup();

      // Un débrief se complète en plusieurs fois : repartir d'un champ vide effacerait ce que
      // l'athlète a déjà écrit dès qu'il revient dessus.
      expect(await findByLabelText(CONTENT)).toHaveValue("Bonne séance");
    });
  });

  describe("ce qui part au serveur", () => {
    it("envoie null plutôt qu'un texte vide", async () => {
      const { user, findByRole } = await setup();

      await user.click(await findByRole("button", { name: SUBMIT }));

      // `content: null` et non `""` (règle dure n°5). Et le décompte porte `"sx-1": null` : une
      // entrée à `null` dit NON SUIVI, ce qui n'est pas « zéro coché » — l'athlète n'a rien dit,
      // et un objet vide lui ferait dire qu'il a ouvert le suivi sans rien cocher.
      await waitFor(() =>
        expect(upsertMock).toHaveBeenCalledWith(SESSION_ID, {
          content: null,
          tracking: { "sx-1": null },
        }),
      );
    });

    it("accompagne le texte du décompte de la séance", async () => {
      const { user, findByLabelText, getByRole } = await setup();

      await user.type(await findByLabelText(CONTENT), "Dur");
      await user.click(getByRole("button", { name: SUBMIT }));

      // UN seul envoi pour les deux : deux boutons feraient croire qu'on peut envoyer l'un sans
      // l'autre, alors que le décompte ACCOMPAGNE le ressenti.
      await waitFor(() =>
        expect(upsertMock).toHaveBeenCalledWith(SESSION_ID, {
          content: "Dur",
          tracking: expect.any(Object),
        }),
      );
    });

    it("n'envoie AUCUN décompte quand la séance n'a pas pu être lue", async () => {
      getSessionMock.mockRejectedValue(new Error("réseau"));
      const { user, findByRole } = await setup();

      await user.click(await findByRole("button", { name: SUBMIT }));

      // Mieux vaut ne rien dire que d'écraser le suivi avec un objet vide : la séance manquante
      // fait perdre le rappel des coches, pas le droit d'écrire.
      await waitFor(() => expect(upsertMock).toHaveBeenCalled());
      const [, input] = upsertMock.mock.calls[0] as [string, object];
      expect(input).not.toHaveProperty("tracking");
    });
  });

  describe("ce que le rail annonce", () => {
    it("dit que le débrief est vide quand il l'est", async () => {
      const { findByText } = await setup();

      expect(await findByText("feedback.submit.empty")).toBeInTheDocument();
    });

    it("dit qu'il y a quelque chose dès qu'un média existe", async () => {
      getFeedbackMock.mockResolvedValue(
        feedback({ media: [{ id: "md-1" }] as SessionFeedbackDto["media"] }),
      );
      const { findByText } = await setup();

      expect(await findByText("feedback.submit.filled")).toBeInTheDocument();
    });
  });

  it("ramène à LA séance, pas au planning", async () => {
    const { findByRole } = await setup();

    // Le débrief est l'enfant de la séance, et c'est de là qu'on vient.
    expect(await findByRole("link", { name: "feedback.backToSession" })).toHaveAttribute(
      "href",
      `/sessions/${SESSION_ID}`,
    );
  });
});

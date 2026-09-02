import type { ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { AthleteFeedbackScreen } from "./AthleteFeedbackScreen";

const { getFeedbackMock, upsertMock, getSessionMock, addFilesMock } = vi.hoisted(() => ({
  getFeedbackMock: vi.fn(),
  upsertMock: vi.fn(),
  getSessionMock: vi.fn(),
  addFilesMock: vi.fn(),
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
    addFiles: addFilesMock,
    addAudio: vi.fn(),
    audioError: null,
    isUploading: false,
    step: null,
    progress: 0,
  }),
  useDeleteFeedbackMedia: () => ({ mutate: vi.fn(), isPending: false }),
}));

/**
 * Le navigateur par défaut de ces tests : il POSSÈDE `MediaRecorder`, mais ne sait produire aucun
 * format que le débrief accepte — le cas Firefox, celui pour lequel `isAvailable` a été écrit.
 * jsdom n'a pas l'API du tout, et sans stub tous les rendus décriraient ce seul cas-là.
 */
const firefoxLike = () => vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });

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
  firefoxLike();
  // `useLocalTracking` lit le stockage du navigateur : un test laisserait sinon ses coches au
  // suivant, qui décrirait une séance déjà remplie sans l'avoir demandé.
  window.localStorage.clear();
  getSessionMock.mockResolvedValue(session());
  getFeedbackMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue(feedback());
  // Aucun refus : le lot part en entier tant qu'un test n'en décide pas autrement.
  addFilesMock.mockResolvedValue([]);
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
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

  describe("l'enregistreur vocal", () => {
    it("dit qu'il n'est pas disponible plutôt que de le proposer", async () => {
      const { findByText } = await setup();

      // Le bouton DISPARAÎT quand aucun format produit n'est accepté : laisser capturer trente
      // secondes pour un 400 à la signature de l'URL serait pire que de ne rien proposer.
      expect(await findByText("feedback.media.recorderUnsupported")).toBeInTheDocument();
    });

    it("survit à un navigateur qui n'a pas MediaRecorder du tout", async () => {
      vi.stubGlobal("MediaRecorder", undefined);
      const { findByLabelText } = await setup();

      // Safari iOS avant 14.5, certaines WebViews. Sans la garde de `pickRecorderMimeType`, ce
      // n'est pas l'enregistreur qui manque : c'est l'écran de débrief entier qui tombe sur un
      // `ReferenceError`, et l'athlète perd le droit d'écrire son ressenti.
      expect(await findByLabelText(CONTENT)).toBeInTheDocument();
    });
  });

  describe("un lot de médias", () => {
    const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

    async function fileInput(rendered: Awaited<ReturnType<typeof setup>>) {
      // Le sélecteur ne naît qu'avec le formulaire : le chercher pendant le chargement ne
      // trouverait rien, et le test échouerait pour une raison qui n'est pas la sienne.
      await rendered.findByLabelText(CONTENT);
      const input = rendered.container.querySelector<HTMLInputElement>('input[type="file"]');
      if (input == null) throw new Error("pas de sélecteur de fichier");
      return input;
    }

    async function pick(files: readonly File[]) {
      const rendered = await setup();
      await rendered.user.upload(await fileInput(rendered), [...files]);
      return rendered;
    }

    /**
     * Le même geste, en contournant l'attribut `accept` — que `user.upload` applique, et qui
     * écarterait le fichier avant que le code ait à le faire. `accept` n'est qu'un filtre
     * d'affichage, que le dialogue système laisse contourner (« tous les fichiers ») : tester avec
     * lui ferait passer le test pour la mauvaise raison.
     */
    async function pickIgnoringAccept(files: readonly File[]) {
      const rendered = await setup();
      fireEvent.change(await fileInput(rendered), { target: { files } });
      return rendered;
    }

    it("envoie toute la sélection d'un seul geste", async () => {
      await pick([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

      // LE geste de #156 : trois photos ne demandent plus trois ouvertures de galerie.
      await waitFor(() => expect(addFilesMock).toHaveBeenCalledTimes(1));
      expect(addFilesMock.mock.calls[0]?.[0]).toHaveLength(3);
    });

    it("envoie ce qui tient dans les places restantes et récapitule le reste", async () => {
      getFeedbackMock.mockResolvedValue(
        feedback({
          media: [
            { id: "m-1", type: "IMAGE" },
            { id: "m-2", type: "IMAGE" },
            { id: "m-3", type: "IMAGE" },
            { id: "m-4", type: "IMAGE" },
          ] as SessionFeedbackDto["media"],
        }),
      );
      const { findByText } = await pick([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

      // Une seule place libre sur cinq : on n'annule PAS le lot pour autant — la première photo
      // part, et les deux autres sont nommées avec leur raison plutôt que perdues en silence.
      await waitFor(() => expect(addFilesMock.mock.calls[0]?.[0]).toHaveLength(1));
      expect(await findByText("b.jpg")).toBeInTheDocument();
      expect(await findByText("c.jpg")).toBeInTheDocument();
    });

    it("écarte un fichier que le débrief ne sait pas joindre sans lui compter de place", async () => {
      const { findByText } = await pickIgnoringAccept([
        new File(["x"], "seance.pdf", { type: "application/pdf" }),
        photo("a.jpg"),
      ]);

      // Le PDF ne consomme aucune place : la photo passe quand même, et le refus est nommé.
      await waitFor(() => expect(addFilesMock.mock.calls[0]?.[0]).toHaveLength(1));
      expect(await findByText("seance.pdf")).toBeInTheDocument();
    });

    it("récapitule l'échec d'un fichier sans rien dire des autres", async () => {
      const files = [photo("a.jpg"), photo("b.jpg")];
      addFilesMock.mockImplementation(async (picked: File[]) => [
        { item: picked[0], error: null },
        { item: picked[1], error: new Error("panne") },
      ]);
      const { findByText, queryByText } = await pick(files);

      // Le fichier passé n'a rien à dire : il est déjà dans la galerie. Seul l'échec se récapitule.
      expect(await findByText("b.jpg")).toBeInTheDocument();
      expect(queryByText("a.jpg")).not.toBeInTheDocument();
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

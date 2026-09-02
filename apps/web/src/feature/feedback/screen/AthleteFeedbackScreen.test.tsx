import type { MediaBatch, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
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

  /**
   * Le TRI d'un lot (places restantes, ordre, récapitulatif) est vérifié dans `@cmv/shared`, où il
   * vit. Ce qui se teste ici est ce que l'écran y apporte : la sélection entière, les quotas du
   * débrief, ce qu'il refuse de joindre, et le rendu du récapitulatif qu'on lui rend.
   */
  describe("un lot de médias", () => {
    const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
    const batchOf = (call: number) => addFilesMock.mock.calls[call]?.[0] as MediaBatch<File>;

    async function pick(files: readonly File[]) {
      const rendered = await setup();
      // Le sélecteur ne naît qu'avec le formulaire : le chercher pendant le chargement ne
      // trouverait rien, et le test échouerait pour une raison qui n'est pas la sienne.
      await rendered.findByLabelText(CONTENT);
      const input = rendered.container.querySelector<HTMLInputElement>('input[type="file"]');
      if (input == null) throw new Error("pas de sélecteur de fichier");
      await rendered.user.upload(input, [...files]);
      return rendered;
    }

    it("confie toute la sélection au lot, d'un seul geste", async () => {
      await pick([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

      // LE geste de #156 : trois photos ne demandent plus trois ouvertures de galerie.
      await waitFor(() => expect(addFilesMock).toHaveBeenCalledTimes(1));
      expect(batchOf(0).items).toHaveLength(3);
    });

    it("annonce au lot les places que le débrief laisse encore", async () => {
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
      await pick([photo("a.jpg"), photo("b.jpg")]);

      // Quatre photos déjà jointes sur cinq : une seule place, et un plafond de lot qui est la
      // somme des places restantes — inutile de préparer ce qu'aucun quota ne peut accueillir.
      await waitFor(() => expect(batchOf(0).remaining.IMAGE).toBe(1));
      expect(batchOf(0).maxItems).toBe(1 + 3);
    });

    it("refuse de joindre un fichier qui n'est ni photo ni vidéo", async () => {
      await pick([photo("a.jpg")]);

      // Lu comme la PRÉPARATION le lira : un HEIC occupe une place de photo quitte à être refusé
      // au format ensuite, tandis qu'un PDF n'en occupe aucune. L'audio s'enregistre, il ne se
      // joint pas comme un fichier.
      await waitFor(() => expect(addFilesMock).toHaveBeenCalled());
      const { kindOf } = batchOf(0);
      expect(kindOf(new File(["x"], "a.heic", { type: "image/heic" }))).toBe("IMAGE");
      expect(kindOf(new File(["x"], "seance.pdf", { type: "application/pdf" }))).toBeNull();
      expect(kindOf(new File(["x"], "note.m4a", { type: "audio/m4a" }))).toBeNull();
    });

    it("nomme chaque fichier écarté et sa raison", async () => {
      addFilesMock.mockResolvedValue([
        { fileName: "trop.mov", reason: { key: "feedback.media.noSlotVideo", params: {} } },
        { fileName: null, reason: { message: "Le serveur a refusé ce fichier." } },
      ]);
      const { findByText } = await pick([photo("a.jpg")]);

      // Un fichier sans nom garde sa ligne : le taire serait pire qu'un libellé de repli.
      expect(await findByText("trop.mov")).toBeInTheDocument();
      expect(await findByText("feedback.media.unnamedFile")).toBeInTheDocument();
      expect(await findByText(/Le serveur a refusé ce fichier./)).toBeInTheDocument();
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

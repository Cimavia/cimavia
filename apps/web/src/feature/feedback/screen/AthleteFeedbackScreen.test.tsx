import type { MediaBatch, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { MAX_FEEDBACK_PHOTOS, MAX_FEEDBACK_VIDEOS, MediaType } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaRejectedError } from "@/shared/util/media.util";
import { renderInRoute } from "../../../../test/render";
import { AthleteFeedbackScreen } from "./AthleteFeedbackScreen";

const { getFeedbackMock, upsertMock, getSessionMock, addFilesMock, addMediaMock, removeMock } =
  vi.hoisted(() => ({
    getFeedbackMock: vi.fn(),
    upsertMock: vi.fn(),
    getSessionMock: vi.fn(),
    addFilesMock: vi.fn(),
    addMediaMock: vi.fn(),
    removeMock: vi.fn(),
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
  useAddFeedbackMedia: () => addMediaMock(),
  useDeleteFeedbackMedia: () => ({ mutate: removeMock, isPending: false }),
}));

/**
 * Le navigateur par défaut de ces tests : il POSSÈDE `MediaRecorder`, mais ne sait produire aucun
 * format que le débrief accepte — le cas Firefox, celui pour lequel `isAvailable` a été écrit.
 * jsdom n'a pas l'API du tout, et sans stub tous les rendus décriraient ce seul cas-là.
 */
const firefoxLike = () => vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });

/**
 * Un navigateur qui sait enregistrer : un `MediaRecorder` minimal, plus le micro que jsdom n'a pas.
 * Il ne simule pas l'audio — il rend joignables les trois gestes de l'écran (démarrer, envoyer,
 * jeter), qui sont ce que le débrief possède ; le décodage, lui, appartient au hook enregistreur.
 */
function recordingCapable() {
  const instances: Array<{ onstop: (() => void) | null; state: string }> = [];
  class FakeRecorder {
    static isTypeSupported = () => true;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = "inactive";
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/mp4" }) });
      this.onstop?.();
    }
    constructor() {
      instances.push(this as unknown as (typeof instances)[number]);
    }
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", {
    ...window.navigator,
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }) },
  });

  // L'horloge avance d'une seconde à chaque lecture : le hook REFUSE une capture de zéro seconde
  // (« j'ai touché le bouton sans le vouloir »), et sans temps qui passe le test décrirait ce
  // refus-là au lieu du geste qu'il vise.
  let clock = 0;
  vi.spyOn(Date, "now").mockImplementation(() => {
    clock += 1_000;
    return clock;
  });
}

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
  // Aucun refus, aucun envoi en cours : un test qui veut l'un ou l'autre le dit lui-même.
  addFilesMock.mockResolvedValue([]);
  addMediaMock.mockReturnValue({
    addFiles: addFilesMock,
    addAudio: vi.fn(),
    audioError: null,
    isUploading: false,
    step: null,
    progress: 0,
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  // Les espions posés sur des globales (`Date.now`, `HTMLInputElement.click`) ne se défont pas
  // avec `clearAllMocks` : sans ça, le test suivant hériterait d'une horloge truquée.
  vi.restoreAllMocks();
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
      // Le débrief est plein d'une photo près. Les plafonds viennent des CONSTANTES : écrits en
      // dur, ce test serait devenu rouge en #156 sans qu'aucune règle n'ait changé.
      getFeedbackMock.mockResolvedValue(
        feedback({
          media: Array.from({ length: MAX_FEEDBACK_PHOTOS - 1 }, (_unused, index) => ({
            id: `m-${index}`,
            type: "IMAGE",
          })) as SessionFeedbackDto["media"],
        }),
      );
      await pick([photo("a.jpg"), photo("b.jpg")]);

      // Une seule place photo, et un plafond de lot qui est la somme des places restantes —
      // inutile de préparer ce qu'aucun quota ne peut accueillir.
      await waitFor(() => expect(batchOf(0).remaining.IMAGE).toBe(1));
      expect(batchOf(0).maxItems).toBe(1 + MAX_FEEDBACK_VIDEOS);
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

  /**
   * Ce que l'écran DÉCIDE et confie au lot : le nom d'un fichier, et le libellé de chaque refus.
   * Ces fonctions ne sont appelées que depuis `@cmv/shared` — les éprouver ici est le seul endroit
   * où l'on vérifie que le débrief nomme ses propres refus, et pas ceux de la messagerie.
   */
  describe("les libellés que l'écran confie au lot", () => {
    const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

    async function batchOf(): Promise<MediaBatch<File>> {
      const rendered = await setup();
      await rendered.findByLabelText(CONTENT);
      const input = rendered.container.querySelector<HTMLInputElement>('input[type="file"]');
      if (input == null) throw new Error("pas de sélecteur de fichier");
      await rendered.user.upload(input, [photo("a.jpg")]);
      await waitFor(() => expect(addFilesMock).toHaveBeenCalled());
      return addFilesMock.mock.calls[0]?.[0] as MediaBatch<File>;
    }

    it("nomme chaque fichier par son nom de fichier", async () => {
      const batch = await batchOf();

      expect(batch.nameOf(photo("voie-jaune.jpg"))).toBe("voie-jaune.jpg");
    });

    it("distingue le type non géré de la place qui manque", async () => {
      const { rejectedReason } = await batchOf();

      expect(rejectedReason({ cause: "unsupported", kind: null })).toEqual({
        key: "feedback.media.unsupported",
        params: {},
      });
      expect(rejectedReason({ cause: "noSlot", kind: MediaType.IMAGE })).toEqual({
        key: "feedback.media.noSlotImage",
        params: {},
      });
      expect(rejectedReason({ cause: "noSlot", kind: MediaType.VIDEO })).toEqual({
        key: "feedback.media.noSlotVideo",
        params: {},
      });
    });

    /**
     * `tooMany` dit la même chose que `noSlot`, et c'est EXACT ici : le plafond du lot est la somme
     * des places restantes, donc un fichier « en trop » est un fichier sans place.
     */
    it("traite un lot trop grand comme une place qui manque", async () => {
      const { rejectedReason } = await batchOf();

      expect(rejectedReason({ cause: "tooMany", kind: MediaType.VIDEO })).toEqual({
        key: "feedback.media.noSlotVideo",
        params: {},
      });
      // Sans type connu, on ne peut pas nommer la place : le refus reste générique.
      expect(rejectedReason({ cause: "tooMany", kind: null })).toEqual({
        key: "feedback.media.unsupported",
        params: {},
      });
    });

    it("garde la clé d'un refus métier et le message d'une panne", async () => {
      const { failureReason } = await batchOf();

      // Un refus métier porte ses PARAMÈTRES : le plafond cité vient de la constante, jamais d'une
      // chaîne écrite en dur.
      expect(
        failureReason(new MediaRejectedError("feedback.media.videoTooBig", { max: 1000 })),
      ).toEqual({ key: "feedback.media.videoTooBig", params: { max: 1000 } });
      // Une panne sans message exploitable retombe sur un libellé, pas sur du vide.
      expect(failureReason(new Error("boom"))).toEqual({
        key: "feedback.media.uploadError",
        params: {},
      });
    });
  });

  describe("ce que l'écran fait des échecs qui n'ont pas de lot", () => {
    const withAudioError = (audioError: unknown) =>
      addMediaMock.mockReturnValue({
        addFiles: addFilesMock,
        addAudio: vi.fn(),
        audioError,
        isUploading: false,
        step: null,
        progress: 0,
      });

    it("traduit le refus métier d'une note vocale", async () => {
      withAudioError(new MediaRejectedError("feedback.media.audioTooLong", { max: 5 }));
      const { findByText } = await setup();

      expect(await findByText("feedback.media.audioTooLong")).toBeInTheDocument();
    });

    it("retombe sur un libellé quand la panne n'a rien d'exploitable", async () => {
      withAudioError(new Error("boom"));
      const { findByText } = await setup();

      // La note vocale n'a pas de récapitulatif où vivre : son échec se dit là, ou nulle part.
      expect(await findByText("feedback.media.uploadError")).toBeInTheDocument();
    });
  });

  describe("l'enregistreur, quand le navigateur sait le faire", () => {
    beforeEach(() => {
      recordingCapable();
    });

    it("propose d'enregistrer, puis d'envoyer ou de jeter la capture", async () => {
      const addAudio = vi.fn();
      addMediaMock.mockReturnValue({
        addFiles: addFilesMock,
        addAudio,
        audioError: null,
        isUploading: false,
        step: null,
        progress: 0,
      });
      const { user, findByRole, getByRole, queryByRole } = await setup();

      await user.click(await findByRole("button", { name: "feedback.media.addAudio" }));

      // En capture, l'écran offre les DEUX sorties : envoyer, ou jeter. Sans la seconde, une note
      // ratée partirait quand même.
      const stop = await findByRole("button", { name: "feedback.media.stopRecording" });
      expect(getByRole("button", { name: "common.cancel" })).toBeInTheDocument();

      await user.click(stop);

      await waitFor(() => expect(addAudio).toHaveBeenCalled());
      expect(queryByRole("button", { name: "common.cancel" })).not.toBeInTheDocument();
    });

    it("jette la capture sans rien envoyer", async () => {
      const addAudio = vi.fn();
      addMediaMock.mockReturnValue({
        addFiles: addFilesMock,
        addAudio,
        audioError: null,
        isUploading: false,
        step: null,
        progress: 0,
      });
      const { user, findByRole, getByRole } = await setup();

      await user.click(await findByRole("button", { name: "feedback.media.addAudio" }));
      await user.click(getByRole("button", { name: "common.cancel" }));

      // Rien ne part : c'est ce qui distingue « annuler » d'« arrêter ».
      expect(addAudio).not.toHaveBeenCalled();
    });
  });

  describe("les gestes de la galerie", () => {
    it("réessaie le chargement quand on le lui demande", async () => {
      getFeedbackMock.mockRejectedValue(new Error("réseau"));
      const { user, findByRole } = await setup();

      await user.click(await findByRole("button", { name: "common.retry" }));

      // L'écriture exige le réseau : on offre de réessayer plutôt que de masquer la panne.
      await waitFor(() => expect(getFeedbackMock.mock.calls.length).toBeGreaterThan(1));
    });

    it("retire un média joint", async () => {
      getFeedbackMock.mockResolvedValue(
        feedback({ media: [{ id: "md-1", type: "IMAGE" }] as SessionFeedbackDto["media"] }),
      );
      const { user, findByRole } = await setup();

      await user.click(await findByRole("button", { name: "feedback.media.remove" }));

      expect(removeMock).toHaveBeenCalledWith("md-1");
    });

    it("ouvre le sélecteur de fichiers depuis le bouton", async () => {
      // L'`input` est caché : c'est le bouton qui le déclenche, et sans ce relais il n'existe
      // aucun moyen d'ajouter un média.
      const open = vi.spyOn(HTMLInputElement.prototype, "click");
      const { user, findByRole } = await setup();

      await user.click(await findByRole("button", { name: "feedback.media.addFile" }));

      expect(open).toHaveBeenCalled();
      open.mockRestore();
    });
  });

  it("dit qu'il y a quelque chose à envoyer quand seul le décompte est rempli", async () => {
    // Le décompte vit en LOCAL pendant la séance et ne franchit le réseau qu'au débrief : un
    // débrief sans texte ni média n'est pas vide pour autant.
    window.localStorage.setItem(
      `cimavia-tracking:${SESSION_ID}`,
      JSON.stringify({ "sx-1": { "b-1": { checked: [0] } } }),
    );
    const { findByText } = await setup();

    expect(await findByText("feedback.submit.filled")).toBeInTheDocument();
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

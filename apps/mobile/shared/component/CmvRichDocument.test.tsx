import { DocumentType, DocumentUsage, type ExerciseDocumentDto, RichBlockType } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderRn } from "../../test/render";
import { CmvRichDocument } from "./CmvRichDocument";

/**
 * Le réseau est piloté PAR TEST, contrairement au harnais global qui le fige à « connecté » :
 * tout l'objet de ces cas est de séparer les deux causes d'échec d'une image.
 */
let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

/**
 * `react-native-web` ne charge PAS l'image par l'élément `<img>` qu'il rend : il instancie un
 * `window.Image` détaché, lui pose `onerror`/`onload`, puis affecte `src`
 * (`ImageLoader.load`). C'est donc ce constructeur qu'un test doit tenir pour décider du sort du
 * chargement — déclencher un événement sur le DOM rendu n'atteindrait jamais le composant.
 *
 * Le verdict est ASYNCHRONE (`setTimeout`) pour que la mise à jour d'état parte hors du rendu,
 * là où React l'attend : les assertions passent par `findBy*`.
 */
function stubImageLoading(outcome: "load" | "error") {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decode = () => Promise.resolve();
    set src(_uri: string) {
      setTimeout(() => (outcome === "load" ? this.onload?.() : this.onerror?.()), 0);
    }
  }
  vi.stubGlobal("Image", StubImage);
}

// L'URI change à chaque cas : `ImageUriCache` de react-native-web est un cache de MODULE, et une
// URI déjà vue court-circuiterait le chargement du cas suivant.
let uriSequence = 0;
function instructionImage(): ExerciseDocumentDto {
  uriSequence += 1;
  return {
    id: "media-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.INSTRUCTION,
    url: `https://storage.test/instruction-${uriSequence}.png`,
    fileName: "prise.png",
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderImageBlock(document: ExerciseDocumentDto, mediaId = "media-1") {
  return renderRn(
    <CmvRichDocument
      blocks={[{ type: RichBlockType.IMAGE, mediaId, caption: "Position basse" }]}
      documents={[document]}
    />,
  );
}

beforeEach(() => {
  reachable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CmvRichDocument — image de consigne", () => {
  /**
   * Le cas de la maquette (cadre 11c « SANS RÉSEAU »). Avant ce test, l'état d'échec était POSÉ
   * par `onError` et rendu nulle part : il restait un cadre gris muet, que le docstring du
   * composant désigne lui-même comme « lu comme un bug ».
   */
  it("dit l'absence de réseau quand l'image échoue hors ligne", async () => {
    reachable = false;
    stubImageLoading("error");

    renderImageBlock(instructionImage());

    expect(await screen.findByText("common.imageOffline")).toBeTruthy();
  });

  /**
   * La même panne visible, une cause opposée : connecté, l'image ne reviendra pas au retour du
   * réseau (URL signée périmée, objet disparu). Annoncer « hors ligne » enverrait l'athlète
   * vérifier une connexion qui marche.
   */
  it("ne parle pas de réseau quand l'image échoue en ligne", async () => {
    stubImageLoading("error");

    renderImageBlock(instructionImage());

    expect(await screen.findByText("common.imageUnavailable")).toBeTruthy();
    expect(screen.queryByText("common.imageOffline")).toBeNull();
  });

  it("n'affiche aucun message quand l'image se charge", async () => {
    stubImageLoading("load");

    renderImageBlock(instructionImage());

    expect(await screen.findByText("Position basse")).toBeTruthy();
    expect(screen.queryByText("common.imageUnavailable")).toBeNull();
    expect(screen.queryByText("common.imageOffline")).toBeNull();
  });

  /**
   * La légende survit à l'échec : elle porte souvent la consigne que l'image illustre, et la
   * perdre coûterait plus que l'image elle-même.
   */
  it("garde la légende quand l'image échoue", async () => {
    reachable = false;
    stubImageLoading("error");

    renderImageBlock(instructionImage());

    expect(await screen.findByText("common.imageOffline")).toBeTruthy();
    expect(screen.getByText("Position basse")).toBeTruthy();
  });

  /**
   * Média introuvable : RIEN, pas de cadre cassé ni de message (règle dure n°5 — l'absence
   * légitime ne se commente pas). C'est un cas différent de l'échec de chargement.
   */
  it("ne rend rien quand le média référencé est absent des documents", () => {
    stubImageLoading("error");

    renderImageBlock(instructionImage(), "media-inconnu");

    expect(screen.queryByText("common.imageOffline")).toBeNull();
    expect(screen.queryByText("common.imageUnavailable")).toBeNull();
    expect(screen.queryByText("Position basse")).toBeNull();
  });
});

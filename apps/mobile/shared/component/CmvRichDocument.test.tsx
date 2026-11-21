import { InlineMark, type RichBlock, RichBlockType } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { Linking } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { press, renderRn } from "../../test/render";
import { CmvRichDocument, type ResolveImage } from "./CmvRichDocument";

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
function nextImageUri(): string {
  uriSequence += 1;
  return `https://storage.test/instruction-${uriSequence}.png`;
}

const paragraph = (text: string): RichBlock => ({
  type: RichBlockType.PARAGRAPH,
  content: [{ text }],
});

/** Le résolveur de l'écran, réduit à une table : le design system ne sait rien d'autre de lui. */
function resolverOf(uriById: Record<string, string>): ResolveImage {
  return (mediaId) => uriById[mediaId] ?? null;
}

function renderImageBlock(
  resolveImage: ResolveImage = resolverOf({ "media-1": nextImageUri() }),
  caption: string | null = "Position basse",
) {
  return renderRn(
    <CmvRichDocument
      blocks={[{ type: RichBlockType.IMAGE, mediaId: "media-1", caption }]}
      resolveImage={resolveImage}
    />,
  );
}

function renderedSource(container: HTMLElement): string | null {
  return container.querySelector("img")?.getAttribute("src") ?? null;
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

    renderImageBlock();

    expect(await screen.findByText("common.imageOffline")).toBeTruthy();
  });

  /**
   * La même panne visible, une cause opposée : connecté, l'image ne reviendra pas au retour du
   * réseau (URL signée périmée, objet disparu). Annoncer « hors ligne » enverrait l'athlète
   * vérifier une connexion qui marche.
   */
  it("ne parle pas de réseau quand l'image échoue en ligne", async () => {
    stubImageLoading("error");

    renderImageBlock();

    expect(await screen.findByText("common.imageUnavailable")).toBeTruthy();
    expect(screen.queryByText("common.imageOffline")).toBeNull();
  });

  it("n'affiche aucun message quand l'image se charge", async () => {
    stubImageLoading("load");

    renderImageBlock();

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

    renderImageBlock();

    expect(await screen.findByText("common.imageOffline")).toBeTruthy();
    expect(screen.getByText("Position basse")).toBeTruthy();
  });

  /**
   * Média introuvable : RIEN, pas de cadre cassé ni de message (règle dure n°5 — l'absence
   * légitime ne se commente pas). C'est un cas différent de l'échec de chargement.
   */
  it("ne rend rien quand le média référencé est introuvable", () => {
    stubImageLoading("error");

    renderImageBlock(resolverOf({}));

    expect(screen.queryByText("common.imageOffline")).toBeNull();
    expect(screen.queryByText("common.imageUnavailable")).toBeNull();
    expect(screen.queryByText("Position basse")).toBeNull();
  });
});

describe("CmvRichDocument — source de l'image", () => {
  /**
   * Une URL re-signée (séance rechargée, consigne restée ouverte) est une AUTRE image : elle
   * repart de « loading ». L'échec de l'ancienne ne doit pas rester affiché sur elle.
   */
  it("oublie l'échec de l'ancienne source quand l'url change", async () => {
    stubImageLoading("error");
    const blocks: RichBlock[] = [{ type: RichBlockType.IMAGE, mediaId: "media-1", caption: null }];
    const { container, rerender } = renderRn(
      <CmvRichDocument blocks={blocks} resolveImage={resolverOf({ "media-1": nextImageUri() })} />,
    );
    expect(await screen.findByText("common.imageUnavailable")).toBeTruthy();

    stubImageLoading("load");
    const fresh = nextImageUri();
    rerender(<CmvRichDocument blocks={blocks} resolveImage={resolverOf({ "media-1": fresh })} />);

    expect(screen.queryByText("common.imageUnavailable")).toBeNull();
    expect(renderedSource(container)).toBe(fresh);
  });

  /** Le design system affiche ce que l'écran résout, sans y retoucher : URL signée ou fichier. */
  it("affiche l'uri que rend le résolveur", () => {
    stubImageLoading("load");

    const { container } = renderImageBlock(
      resolverOf({ "media-1": "file:///documents/plan-documents/plan-1/media-1.png" }),
    );

    expect(renderedSource(container)).toBe("file:///documents/plan-documents/plan-1/media-1.png");
  });

  /** Résolveur `null`, l'image n'est pas rendue — légende comprise — et le texte reste lisible. */
  it("ne rend pas l'image quand l'écran renonce aux images, et garde le texte", () => {
    stubImageLoading("load");

    const { container } = renderRn(
      <CmvRichDocument
        blocks={[
          { type: RichBlockType.IMAGE, mediaId: "media-1", caption: "Position basse" },
          paragraph("Pieds à plat."),
        ]}
        resolveImage={null}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("Pieds à plat.");
  });
});

describe("CmvRichDocument — légende d'image", () => {
  /** Une légende vide n'est pas une légende : aucun texte fantôme sous l'image. */
  it.each([
    ["absente", null],
    ["vide", ""],
  ])("n'ajoute aucun texte quand elle est %s", (_, caption) => {
    stubImageLoading("load");

    const { container } = renderImageBlock(resolverOf({ "media-1": nextImageUri() }), caption);

    expect(container.textContent).toBe("");
  });
});

function renderBlocks(blocks: RichBlock[] | null) {
  return renderRn(<CmvRichDocument blocks={blocks} resolveImage={null} />);
}

/** Le texte de chaque bloc de premier niveau, dans l'ordre du document. */
function blockTexts(container: HTMLElement): (string | null)[] {
  const root = container.firstElementChild;
  return root == null ? [] : [...root.children].map((block) => block.textContent);
}

/**
 * Sous le harnais, NativeWind ne transforme pas `className` : les marques (gras, italique,
 * souligné) et le style d'un titre n'atteignent pas le DOM. Ce qui s'affirme ici est ce que
 * l'athlète lit — le texte, son ordre, la numérotation — et ce que le lien fait.
 */
describe("CmvRichDocument — une consigne absente", () => {
  it.each([
    ["null", null],
    ["vide", []],
  ])("ne rend rien quand elle vaut %s", (_, blocks) => {
    const { container } = renderBlocks(blocks);

    // Pas de « aucune consigne » : l'absence est légitime, la signaler serait du bruit.
    expect(container.textContent).toBe("");
    expect(container.firstElementChild).toBeNull();
  });
});

describe("CmvRichDocument — les blocs de texte", () => {
  it("rend titre, paragraphe et encadré dans l'ordre du document", () => {
    const { container } = renderBlocks([
      { type: RichBlockType.HEADING, content: [{ text: "Mise en place" }] },
      paragraph("Pieds à plat."),
      { type: RichBlockType.CALLOUT, content: [{ text: "Ne jamais verrouiller." }] },
    ]);

    expect(blockTexts(container)).toEqual([
      "Mise en place",
      "Pieds à plat.",
      "Ne jamais verrouiller.",
    ]);
  });

  it("compose les fragments marqués et nus dans une seule phrase", () => {
    const { container } = renderBlocks([
      {
        type: RichBlockType.PARAGRAPH,
        content: [
          { text: "Tirer " },
          { text: "fort", marks: [InlineMark.BOLD, InlineMark.ITALIC, InlineMark.UNDERLINE] },
          { text: " jusqu'au bout." },
        ],
      },
    ]);

    expect(blockTexts(container)).toEqual(["Tirer fort jusqu'au bout."]);
  });

  it("ouvre l'adresse du lien pressé", () => {
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderBlocks([
      {
        type: RichBlockType.PARAGRAPH,
        content: [
          { text: "Voir " },
          { text: "la vidéo", href: "https://exemple.fr/v", marks: [InlineMark.ITALIC] },
        ],
      },
    ]);

    press(screen.getByText("la vidéo"));

    expect(openURL).toHaveBeenCalledWith("https://exemple.fr/v");
    openURL.mockRestore();
  });
});

describe("CmvRichDocument — les listes", () => {
  it.each([
    [true, ["1. Un", "2. Deux"]],
    [false, ["• Un", "• Deux"]],
  ])("ordered=%s préfixe chaque item de son repère", (ordered, expected) => {
    const { container } = renderBlocks([
      { type: RichBlockType.LIST, ordered, items: [[{ text: "Un" }], [{ text: "Deux" }]] },
    ]);

    const list = container.firstElementChild?.firstElementChild;
    expect([...(list?.children ?? [])].map((item) => item.textContent)).toEqual(expected);
  });
});

/**
 * Un nœud de document n'a pas d'identifiant : sa clé de rendu est son index. #504 la remettra en
 * question (S6479). Ces cas sont ceux qu'une clé tirée du CONTENU casserait — deux frères
 * identiques qui entrent en collision, et un retrait qui ferait survivre le mauvais.
 */
describe("CmvRichDocument — des frères identiques", () => {
  it("rend chacun de deux paragraphes, deux items et deux fragments identiques", () => {
    const { container } = renderBlocks([
      paragraph("Respirer."),
      paragraph("Respirer."),
      { type: RichBlockType.LIST, ordered: true, items: [[{ text: "Rep" }], [{ text: "Rep" }]] },
      {
        type: RichBlockType.PARAGRAPH,
        content: [
          { text: "ha", marks: [InlineMark.BOLD] },
          { text: "ha", marks: [InlineMark.BOLD] },
        ],
      },
    ]);

    expect(blockTexts(container)).toEqual(["Respirer.", "Respirer.", "1. Rep2. Rep", "haha"]);
  });

  it("garde le bon bloc quand le premier de deux est retiré", () => {
    const { container, rerender } = renderBlocks([
      { type: RichBlockType.HEADING, content: [{ text: "Échauffement" }] },
      paragraph("Respirer."),
    ]);

    rerender(<CmvRichDocument blocks={[paragraph("Respirer.")]} resolveImage={null} />);

    expect(blockTexts(container)).toEqual(["Respirer."]);
  });
});

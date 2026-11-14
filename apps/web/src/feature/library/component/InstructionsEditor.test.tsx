import { MAX_DOCUMENT_SIZE_BYTES, RichBlockType, type RichDocument } from "@cmv/shared";
import { fireEvent, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { InstructionMedia } from "@/feature/library/hook/useInstructionMedia";
import { RefusedFieldsContext } from "@/shared/hook/useRefusedFields";
import { installProseMirrorLayout } from "../../../../test/prosemirror";
import { renderWithProviders } from "../../../../test/render";
import { InstructionMediaProvider, useInstructionMediaContext } from "./InstructionMediaContext";
import { InstructionsEditor } from "./InstructionsEditor";

beforeAll(installProseMirrorLayout);

const paragraph = (text: string) => ({ type: RichBlockType.PARAGRAPH, content: [{ text }] });
const linked = (text: string, href: string) => ({
  type: RichBlockType.PARAGRAPH,
  content: [{ text, href }],
});

/** Le presse-papiers tel que ProseMirror le lit : jsdom n'a pas de `DataTransfer`. */
function clipboard(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    getData: (type: string) => entries[type] ?? "",
    setData: () => undefined,
    items: [],
    files: [],
  } as unknown as DataTransfer;
}

function fakeMedia(overrides: Partial<InstructionMedia> = {}): InstructionMedia {
  return {
    register: vi.fn(() => "pending:1"),
    resolve: vi.fn((mediaId: string) => `blob:${mediaId}`),
    pending: [],
    sent: new Map(),
    markSent: vi.fn(),
    forgetUncitedSent: vi.fn(),
    progress: {},
    setProgress: vi.fn(),
    ...overrides,
  };
}

function setup(initialValue: RichDocument | null, media: InstructionMedia = fakeMedia()) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <InstructionMediaProvider media={media}>
      <InstructionsEditor initialValue={initialValue} onChange={onChange} />
    </InstructionMediaProvider>,
  );
  const surface = view.container.querySelector(".ProseMirror") as HTMLElement;
  /** Le coach sélectionne tout son texte : focus clavier, puis Ctrl+A. */
  const selectAll = async () => {
    surface.focus();
    await view.user.keyboard("{Control>}a{/Control}");
  };
  /**
   * Le curseur dans le texte `text`, à `offset` : jsdom ne place rien au clavier ni au clic, la
   * sélection se pose dans le DOM et ProseMirror la relit à `selectionchange`.
   */
  const caretAt = (text: string, offset: number) => {
    surface.focus();
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node != null && node.textContent !== text) node = walker.nextNode();
    if (node == null) throw new Error(`Texte absent de la consigne : ${text}`);
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));
  };
  const tool = (name: string) => view.getByRole("button", { name: `library.builder.tool.${name}` });
  const last = () => onChange.mock.lastCall?.[0] as RichDocument;
  const fileInput = () => view.container.querySelector("input[type=file]") as HTMLInputElement;
  return { ...view, onChange, media, surface, selectAll, caretAt, tool, last, fileInput };
}

/**
 * #319 : un éditeur riche ne se borne pas par `maxLength`. Une consigne qui dépasse une borne de
 * `richDocumentSchema` le dit sous elle, et se déclare refusée — c'est ce qui ferme l'enregistrement.
 */
describe("InstructionsEditor — bornes de texte (#319)", () => {
  const TOO_LONG = "library.builder.instructionsTooLong";
  const COUNT = "common.charCount";
  const thousand = () => paragraph("x".repeat(1000));

  function mount(initialValue: RichDocument, readOnly = false) {
    const report = vi.fn();
    const view = renderWithProviders(
      <RefusedFieldsContext value={report}>
        <InstructionMediaProvider media={fakeMedia()}>
          <InstructionsEditor initialValue={initialValue} onChange={vi.fn()} readOnly={readOnly} />
        </InstructionMediaProvider>
      </RefusedFieldsContext>,
    );
    return { ...view, report };
  }

  it("se tait, sans compteur ni refus, loin des bornes", () => {
    const { queryByText, report } = mount([paragraph("Coudes serrés")]);

    expect(queryByText(COUNT)).not.toBeInTheDocument();
    expect(queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("montre le compteur à l'approche du cumul, sans refuser", () => {
    const { getByText, queryByText, report } = mount([
      thousand(),
      thousand(),
      thousand(),
      thousand(),
      paragraph("x".repeat(600)),
    ]);

    expect(getByText(COUNT)).toBeInTheDocument();
    expect(queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("dit le cumul dépassé sous la consigne, et se déclare refusée", () => {
    const { getByText, report } = mount(Array.from({ length: 6 }, thousand));

    expect(getByText(TOO_LONG)).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith(expect.any(String), true);
  });

  // En Lecture, rien ne se saisit : un refus fermerait l'enregistrement et demanderait, en
  // partant, de quitter une saisie qui n'existe pas.
  it("ne refuse rien en Lecture, même au-delà du cumul", () => {
    const { queryByText, report } = mount(Array.from({ length: 6 }, thousand), true);

    expect(queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("ne refuse pas un long paragraphe d'un seul tenant tant que le cumul tient", () => {
    const { queryByText, report } = mount([paragraph("x".repeat(2500))]);

    expect(queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("lève le refus quand la consigne revient dans ses bornes", async () => {
    const { container, user, queryByText, report } = mount(Array.from({ length: 6 }, thousand));

    (container.querySelector(".ProseMirror") as HTMLElement).focus();
    await user.keyboard("{Control>}a{/Control}{Backspace}");

    expect(queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
  });
});

describe("InstructionsEditor — ouverture", () => {
  it("rend la consigne enregistrée, sans la réécrire", () => {
    const { surface, onChange } = setup([
      { type: RichBlockType.HEADING, content: [{ text: "Mise en place" }] },
      paragraph("Coudes serrés"),
      { type: RichBlockType.LIST, ordered: false, items: [[{ text: "Épaules basses" }]] },
      { type: RichBlockType.CALLOUT, content: [{ text: "Pas de dos creux" }] },
    ]);

    expect(surface.querySelector("h3")).toHaveTextContent("Mise en place");
    expect(surface.querySelector("p")).toHaveTextContent("Coudes serrés");
    expect(surface.querySelector("ul li")).toHaveTextContent("Épaules basses");
    expect(surface.querySelector("aside[data-callout]")).toHaveTextContent("Pas de dos creux");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("s'ouvre vide sur une consigne absente", () => {
    const { surface, onChange } = setup(null);

    expect(surface.textContent).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("InstructionsEditor — mise en forme", () => {
  it.each([
    ["bold", "BOLD"],
    ["italic", "ITALIC"],
    ["underline", "UNDERLINE"],
  ])("« %s » marque la sélection, puis la démarque", async (name, mark) => {
    const { user, selectAll, tool, last } = setup([paragraph("Coudes serrés")]);

    await selectAll();
    await user.click(tool(name));
    expect(last()).toEqual([
      { ...paragraph("Coudes serrés"), content: [{ text: "Coudes serrés", marks: [mark] }] },
    ]);
    expect(tool(name)).toHaveAttribute("aria-pressed", "true");

    await user.click(tool(name));
    expect(last()).toEqual([paragraph("Coudes serrés")]);
    expect(tool(name)).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["heading", { type: RichBlockType.HEADING, content: [{ text: "Exécution" }] }],
    ["callout", { type: RichBlockType.CALLOUT, content: [{ text: "Exécution" }] }],
    ["bulletList", { type: RichBlockType.LIST, ordered: false, items: [[{ text: "Exécution" }]] }],
    ["orderedList", { type: RichBlockType.LIST, ordered: true, items: [[{ text: "Exécution" }]] }],
  ])(
    "« %s » change la nature du bloc du curseur, et le second clic la rend",
    async (name, block) => {
      const { user, surface, tool, last } = setup([paragraph("Exécution")]);

      // Le curseur dans le bloc, pas Ctrl+A : sous une sélection TOTALE, TipTap ne voit pas le
      // bloc actif, et le second clic le reposerait au lieu de le rendre.
      surface.focus();
      await user.click(tool(name));
      expect(last()).toEqual([block]);
      expect(tool(name)).toHaveAttribute("aria-pressed", "true");

      await user.click(tool(name));
      expect(last()).toEqual([paragraph("Exécution")]);
    },
  );

  // Un clic ordinaire volerait le focus à l'éditeur, donc la sélection : la marque tomberait
  // sur un curseur vide.
  it("garde la sélection de l'éditeur au clic sur un outil", async () => {
    const { user, selectAll, tool, surface } = setup([paragraph("Coudes serrés")]);

    await selectAll();
    await user.click(tool("bold"));

    expect(document.activeElement).toBe(surface);
  });
});

describe("InstructionsEditor — lien", () => {
  const LINK_URL = "library.builder.tool.linkUrl";
  const APPLY = "library.builder.tool.linkApply";

  async function openLink(initial: RichDocument = [paragraph("la vidéo")]) {
    const view = setup(initial);
    await view.selectAll();
    await view.user.click(view.tool("link"));
    return view;
  }

  it("ouvre un champ prérempli du protocole, prêt à taper, qui ne s'applique pas vide", async () => {
    const { getByRole } = await openLink();
    const field = getByRole("textbox", { name: LINK_URL });

    expect(field).toHaveValue("https://");
    expect(field).toHaveFocus();
    expect(getByRole("button", { name: APPLY })).toBeDisabled();
  });

  it.each([
    [
      "au bouton",
      async (view: Awaited<ReturnType<typeof openLink>>) =>
        view.user.click(view.getByRole("button", { name: APPLY })),
    ],
    [
      "à Entrée",
      async (view: Awaited<ReturnType<typeof openLink>>) => view.user.keyboard("{Enter}"),
    ],
  ])("pose le lien %s, et referme le champ", async (_case, apply) => {
    const view = await openLink();
    const field = view.getByRole("textbox", { name: LINK_URL });

    await view.user.clear(field);
    await view.user.type(field, "https://video.example/tuto");
    await apply(view);

    expect(view.last()).toEqual([linked("la vidéo", "https://video.example/tuto")]);
    expect(view.queryByRole("textbox", { name: LINK_URL })).not.toBeInTheDocument();
    expect(view.tool("link")).toHaveAttribute("aria-pressed", "true");
  });

  // `javascript:` est une URL syntaxiquement valide : sans le schéma du serveur, un lien de
  // consigne deviendrait un vecteur XSS.
  it("refuse un lien qui n'est pas en http ou https, même à Entrée", async () => {
    const view = await openLink();
    const field = view.getByRole("textbox", { name: LINK_URL });

    await view.user.clear(field);
    await view.user.type(field, "javascript:alert(1)");
    expect(view.getByRole("button", { name: APPLY })).toBeDisabled();
    await view.user.keyboard("{Enter}");

    expect(view.onChange).not.toHaveBeenCalled();
    expect(field).toBeInTheDocument();
  });

  it.each([
    [
      "à Échap",
      async (view: Awaited<ReturnType<typeof openLink>>) => view.user.keyboard("{Escape}"),
    ],
    [
      "au bouton",
      async (view: Awaited<ReturnType<typeof openLink>>) =>
        view.user.click(view.getByRole("button", { name: "library.builder.tool.linkCancel" })),
    ],
  ])("renonce au lien %s, sans rien poser", async (_case, cancel) => {
    const view = await openLink();

    await view.user.type(view.getByRole("textbox", { name: LINK_URL }), "video.example");
    await cancel(view);

    expect(view.queryByRole("textbox", { name: LINK_URL })).not.toBeInTheDocument();
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("retire le lien de la sélection quand elle en porte un", async () => {
    const view = setup([linked("la vidéo", "https://video.example")]);

    await view.selectAll();
    await view.user.click(view.tool("link"));

    expect(view.last()).toEqual([paragraph("la vidéo")]);
    expect(view.queryByRole("textbox", { name: LINK_URL })).not.toBeInTheDocument();
  });
});

/**
 * #329 : un lien que le serveur refuse faisait refuser TOUT l'exercice. Sans passer par le bouton,
 * seul un http(s) écrit en entier devient un lien — une adresse e-mail reste du texte.
 */
describe("InstructionsEditor — lien posé sans le bouton", () => {
  it("laisse en texte une adresse e-mail tapée", async () => {
    const { user, surface, last } = setup(null);

    surface.focus();
    await user.type(surface, "Questions : coach@club.fr fin");

    expect(last()).toEqual([paragraph("Questions : coach@club.fr fin")]);
  });

  it("fait un lien d'une adresse http(s) tapée en entier", async () => {
    const { user, surface, last } = setup(null);

    surface.focus();
    await user.type(surface, "https://cimavia.fr ");

    expect(last()).toEqual([
      {
        type: RichBlockType.PARAGRAPH,
        content: [{ text: "https://cimavia.fr", href: "https://cimavia.fr" }, { text: " " }],
      },
    ]);
  });

  it.each(["Écrire à coach@club.fr", "Voir cimavia.fr"])(
    "laisse en texte « %s » collé",
    async (pasted) => {
      const { user, surface, last } = setup(null);

      surface.focus();
      await user.paste(clipboard({ "text/plain": pasted }));

      expect(last()).toEqual([paragraph(pasted)]);
    },
  );

  // Le cas le plus courant en vrai : un lien `mailto:` copié depuis un mail ou une page web.
  it("garde le texte mais pas le lien d'un mailto collé en html", async () => {
    const { user, surface, last } = setup(null);

    surface.focus();
    await user.paste(
      clipboard({
        "text/html": '<p>Écrire à <a href="mailto:coach@club.fr">coach@club.fr</a></p>',
        "text/plain": "Écrire à coach@club.fr",
      }),
    );

    expect(last()).toEqual([paragraph("Écrire à coach@club.fr")]);
  });

  it("ne pose pas de lien en collant une adresse e-mail sur une sélection", async () => {
    const { user, selectAll, last } = setup([paragraph("le coach")]);

    await selectAll();
    await user.paste(clipboard({ "text/plain": "coach@club.fr" }));

    expect(last()).toEqual([paragraph("coach@club.fr")]);
  });

  it("pose le lien en collant une adresse http(s) sur une sélection", async () => {
    const { user, selectAll, last } = setup([paragraph("la vidéo")]);

    await selectAll();
    await user.paste(clipboard({ "text/plain": "https://video.example/tuto" }));

    expect(last()).toEqual([linked("la vidéo", "https://video.example/tuto")]);
  });
});

describe("InstructionsEditor — image", () => {
  const png = () => new File(["x"], "prise.png", { type: "image/png" });

  it("pose l'image choisie sous un id provisoire", async () => {
    const { user, fileInput, media, last } = setup([paragraph("Prise")]);
    const file = png();

    await user.upload(fileInput(), file);

    expect(media.register).toHaveBeenCalledExactlyOnceWith(file, "image/png");
    expect(last()).toContainEqual({ type: RichBlockType.IMAGE, mediaId: "pending:1" });
  });

  // Sans remise à zéro, rechoisir le MÊME fichier après un retrait ne déclencherait rien.
  it("vide le champ fichier après chaque choix", async () => {
    const { user, fileInput } = setup(null);

    await user.upload(fileInput(), png());

    expect(fileInput().value).toBe("");
  });

  // Certains navigateurs signalent un `change` à liste vide quand le sélecteur est fermé sans choix.
  it("ne pose rien quand le sélecteur se ferme sans fichier", () => {
    const { fileInput, media, onChange, queryByText } = setup(null);

    fireEvent.change(fileInput(), { target: { files: [] } });

    expect(media.register).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByText("library.builder.image.errorType")).not.toBeInTheDocument();
  });

  it("refuse un fichier qui n'est pas une image admise, avant tout envoi", async () => {
    const { fileInput, media, getByText, onChange } = setup(null);

    // `fireEvent` et non `user.upload`, qui filtre d'office sur `accept` : le sélecteur natif se
    // contourne (glisser, « Tous les fichiers »), c'est le garde du composant qui est éprouvé ici.
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "programme.pdf", { type: "application/pdf" })] },
    });

    expect(getByText("library.builder.image.errorType")).toBeInTheDocument();
    expect(media.register).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuse une image trop lourde, avant tout envoi", async () => {
    const { user, fileInput, media, getByText } = setup(null);
    const heavy = png();
    Object.defineProperty(heavy, "size", { value: MAX_DOCUMENT_SIZE_BYTES + 1 });

    await user.upload(fileInput(), heavy);

    expect(getByText("library.builder.image.errorSize")).toBeInTheDocument();
    expect(media.register).not.toHaveBeenCalled();
  });

  it("accepte une image au poids maximal exact", async () => {
    const { user, fileInput, media } = setup(null);
    const limit = png();
    Object.defineProperty(limit, "size", { value: MAX_DOCUMENT_SIZE_BYTES });

    await user.upload(fileInput(), limit);

    expect(media.register).toHaveBeenCalledOnce();
  });

  it("efface le refus au choix suivant", async () => {
    const { user, fileInput, queryByText } = setup(null);
    const heavy = png();
    Object.defineProperty(heavy, "size", { value: MAX_DOCUMENT_SIZE_BYTES + 1 });

    await user.upload(fileInput(), heavy);
    await user.upload(fileInput(), png());

    expect(queryByText("library.builder.image.errorSize")).not.toBeInTheDocument();
  });
});

describe("InstructionsEditor — collage", () => {
  it("reconnaît un encadré collé", async () => {
    const { user, selectAll, last } = setup([paragraph("x")]);

    await selectAll();
    await user.paste(
      clipboard({
        "text/html": '<aside data-callout="">Attention</aside>',
        "text/plain": "Attention",
      }),
    );

    expect(last()).toEqual([{ type: RichBlockType.CALLOUT, content: [{ text: "Attention" }] }]);
  });

  // Une image collée du web porte une URL externe : le fichier doit passer par notre stockage.
  it("ne crée aucune image depuis un collage", async () => {
    const { user, selectAll, last, media } = setup([paragraph("x")]);

    await selectAll();
    await user.paste(
      clipboard({
        "text/html": '<p>Voir</p><img src="https://ailleurs.example/prise.png">',
        "text/plain": "Voir",
      }),
    );

    expect(last()).toEqual([paragraph("Voir")]);
    expect(media.register).not.toHaveBeenCalled();
  });
});

/**
 * #328 : le modèle ne porte ni sous-liste ni saut de ligne. L'éditeur ne doit donc pas en
 * produire — la conversion les jetait, et le coach voyait son texte disparaître à l'enregistrement.
 */
describe("InstructionsEditor — ce que le modèle ne porte pas (#328)", () => {
  const list = (...items: string[]): RichDocument => [
    { type: RichBlockType.LIST, ordered: false, items: items.map((text) => [{ text }]) },
  ];

  it("n'imbrique pas un élément de liste à Tab, et laisse Tab sortir du champ", async () => {
    const { user, surface, caretAt, onChange } = setup(list("Échauffement", "10 min vélo"));

    caretAt("10 min vélo", 3);
    // La pose du curseur dans jsdom relit le DOM et peut notifier : seul Tab est éprouvé.
    onChange.mockClear();
    await user.keyboard("{Tab}");

    expect(onChange).not.toHaveBeenCalled();
    expect(surface).not.toHaveFocus();
  });

  it("ne range pas à Tab le paragraphe qui suit une liste dans son dernier élément", async () => {
    const initial = [...list("Échauffement"), paragraph("Retour au calme")];
    const { user, caretAt, onChange } = setup(initial);

    caretAt("Retour au calme", 0);
    onChange.mockClear();
    await user.keyboard("{Tab}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("coupe le paragraphe en deux à Maj+Entrée, au lieu d'y poser un saut de ligne", async () => {
    const { user, caretAt, last } = setup([paragraph("Coudes serrés")]);

    caretAt("Coudes serrés", 7);
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(last()).toEqual([paragraph("Coudes "), paragraph("serrés")]);
  });

  it("coupe l'élément de liste en deux à Maj+Entrée", async () => {
    const { user, caretAt, last } = setup(list("Échauffement 10 min vélo"));

    caretAt("Échauffement 10 min vélo", 13);
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(last()).toEqual(list("Échauffement ", "10 min vélo"));
  });

  // L'élément n'ayant plus qu'un paragraphe, ProseMirror enveloppait le bloc dans un NOUVEL élément
  // — que Backspace ressortait aussitôt de la liste, sans fin.
  it("joint au dernier élément, à Backspace, le paragraphe qui suit la liste", async () => {
    const { user, caretAt, last } = setup([...list("Échauffement "), paragraph("10 min vélo")]);

    caretAt("10 min vélo", 0);
    await user.keyboard("{Backspace}");

    expect(last()).toEqual(list("Échauffement 10 min vélo"));
  });

  it("joint au dernier élément, à Suppr, le paragraphe qui suit la liste", async () => {
    const { user, caretAt, last } = setup([...list("Échauffement "), paragraph("10 min vélo")]);

    caretAt("Échauffement ", "Échauffement ".length);
    await user.keyboard("{Delete}");

    expect(last()).toEqual(list("Échauffement 10 min vélo"));
  });

  it("laisse Suppr à la liste quand l'élément n'est pas le dernier", async () => {
    const { user, caretAt, last } = setup([
      ...list("Échauffement ", "10 min vélo"),
      paragraph("x"),
    ]);

    caretAt("Échauffement ", "Échauffement ".length);
    await user.keyboard("{Delete}");

    expect(last()).toEqual([...list("Échauffement 10 min vélo"), paragraph("x")]);
  });

  it.each([
    [
      "une liste imbriquée, remise à plat",
      "<ul><li>Échauffement<ul><li>10 min vélo</li></ul></li></ul>",
      [...list("Échauffement"), ...list("10 min vélo")],
    ],
    [
      "un élément à deux paragraphes, en deux éléments",
      "<ul><li><p>Échauffement</p><p>10 min vélo</p></li></ul>",
      list("Échauffement", "10 min vélo"),
    ],
    ["un saut de ligne, en espace", "<p>Coudes<br>serrés</p>", [paragraph("Coudes serrés")]],
  ])("garde tout le texte collé : %s", async (_, html, expected) => {
    const { user, selectAll, last } = setup([paragraph("x")]);

    await selectAll();
    await user.paste(clipboard({ "text/html": html, "text/plain": "x" }));

    expect(last()).toEqual(expected);
  });
});

describe("InstructionsEditor — une image posée", () => {
  const image = (extra: Record<string, unknown> = {}) =>
    [{ type: RichBlockType.IMAGE, mediaId: "doc_1", ...extra }] as RichDocument;

  it("montre l'image résolue par le magasin, sa légende en texte alternatif", () => {
    const { getByRole } = setup(image({ caption: "Prise pince" }));

    expect(getByRole("img", { name: "Prise pince" })).toHaveAttribute("src", "blob:doc_1");
  });

  // Une image dont l'URL n'est plus connue ne s'affiche pas en cassé : elle se dit manquante.
  it("dit l'image manquante quand le magasin ne la connaît pas", () => {
    const { queryByRole, getByText } = setup(image(), fakeMedia({ resolve: vi.fn(() => null) }));

    expect(getByText("library.builder.image.missing")).toBeInTheDocument();
    expect(queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["en cours d'envoi", { doc_1: 40 }, true],
    ["envoyée", { doc_1: 100 }, false],
    ["pas encore partie", {}, false],
  ])("montre la progression d'une image %s : %s", (_case, progress, shown) => {
    const { queryByText } = setup(image(), fakeMedia({ progress }));

    expect(queryByText("library.builder.image.uploading") != null).toBe(shown);
  });

  it("change la largeur de l'image", async () => {
    const { user, getByRole, last } = setup(image());

    expect(getByRole("combobox", { name: "library.builder.image.width" })).toHaveValue("FULL");
    await user.selectOptions(
      getByRole("combobox", { name: "library.builder.image.width" }),
      "SMALL",
    );

    expect(last()).toEqual(image({ width: "SMALL" }));
  });

  it("écrit la légende de l'image", async () => {
    const { user, getByRole, last } = setup(image());

    await user.type(getByRole("textbox", { name: "library.builder.image.caption" }), "Prise");

    expect(last()).toEqual(image({ caption: "Prise" }));
  });

  it("retire l'image de la consigne, et elle seule", async () => {
    const { user, findByRole, last } = setup([paragraph("Avant"), ...image(), paragraph("Après")]);

    await user.click(await findByRole("button", { name: "library.builder.image.remove" }));

    expect(last()).toEqual([paragraph("Avant"), paragraph("Après")]);
  });
});

describe("InstructionsEditor — en lecture (#606)", () => {
  function readOnly(initialValue: RichDocument, rerenderAs?: boolean) {
    const ui = (locked: boolean) => (
      <InstructionMediaProvider media={fakeMedia()}>
        <InstructionsEditor initialValue={initialValue} onChange={vi.fn()} readOnly={locked} />
      </InstructionMediaProvider>
    );
    const view = renderWithProviders(ui(true));
    if (rerenderAs != null) view.rerender(ui(rerenderAs));
    return view;
  }

  it("ni outil, ni compteur, et le texte ne s'édite pas", () => {
    const { container, queryByRole } = readOnly([paragraph("Prise pronation")]);

    expect(queryByRole("button", { name: "library.builder.tool.bold" })).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  });

  it("une image n'offre que sa légende, sans réglage ni retrait", () => {
    const { getByText, queryByRole } = readOnly([
      { type: RichBlockType.IMAGE, mediaId: "doc_1", caption: "Prise pince" },
    ] as RichDocument);

    expect(getByText("Prise pince")).toBeInTheDocument();
    expect(queryByRole("combobox")).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "library.builder.image.remove" })).not.toBeInTheDocument();
  });

  it("suit le droit s'il change sans remontage", () => {
    const { container } = readOnly([paragraph("Prise pronation")], false);

    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");
  });
});

describe("useInstructionMediaContext", () => {
  // Une vue de nœud image hors du fournisseur ne saurait ni s'afficher ni progresser : c'est une
  // erreur de montage, qui doit se voir tout de suite plutôt qu'en image vide.
  it("refuse d'être lu hors de son fournisseur", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useInstructionMediaContext())).toThrow(
      "hors de InstructionMediaProvider",
    );
  });
});

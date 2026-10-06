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
  const tool = (name: string) => view.getByRole("button", { name: `library.builder.tool.${name}` });
  const last = () => onChange.mock.lastCall?.[0] as RichDocument;
  const fileInput = () => view.container.querySelector("input[type=file]") as HTMLInputElement;
  return { ...view, onChange, media, surface, selectAll, tool, last, fileInput };
}

/**
 * #319 : un éditeur riche ne se borne pas par `maxLength`. Une consigne qui dépasse une borne de
 * `richDocumentSchema` le dit sous elle, et se déclare refusée — c'est ce qui ferme l'enregistrement.
 */
describe("InstructionsEditor — bornes de texte (#319)", () => {
  const TOO_LONG = "library.builder.instructionsTooLong";
  const COUNT = "common.charCount";
  const thousand = () => paragraph("x".repeat(1000));

  function mount(initialValue: RichDocument) {
    const report = vi.fn();
    const view = renderWithProviders(
      <RefusedFieldsContext value={report}>
        <InstructionMediaProvider media={fakeMedia()}>
          <InstructionsEditor initialValue={initialValue} onChange={vi.fn()} />
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
  ])("« %s » change la nature du bloc du curseur, et le second clic la rend", async (name, block) => {
    const { user, surface, tool, last } = setup([paragraph("Exécution")]);

    // Le curseur dans le bloc, pas Ctrl+A : sous une sélection TOTALE, TipTap ne voit pas le
    // bloc actif, et le second clic le reposerait au lieu de le rendre.
    surface.focus();
    await user.click(tool(name));
    expect(last()).toEqual([block]);
    expect(tool(name)).toHaveAttribute("aria-pressed", "true");

    await user.click(tool(name));
    expect(last()).toEqual([paragraph("Exécution")]);
  });

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

    expect(view.last()).toEqual([
      {
        type: RichBlockType.PARAGRAPH,
        content: [{ text: "la vidéo", href: "https://video.example/tuto" }],
      },
    ]);
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
    const view = setup([
      {
        type: RichBlockType.PARAGRAPH,
        content: [{ text: "la vidéo", href: "https://video.example" }],
      },
    ]);

    await view.selectAll();
    await view.user.click(view.tool("link"));

    expect(view.last()).toEqual([paragraph("la vidéo")]);
    expect(view.queryByRole("textbox", { name: LINK_URL })).not.toBeInTheDocument();
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

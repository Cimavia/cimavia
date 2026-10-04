import {
  ApiError,
  BlockType,
  type CustomMetric,
  DocumentType,
  DocumentUsage,
  type ExerciseDto,
  formatTrainingDuration,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
  RichBlockType,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installProseMirrorLayout } from "../../../../test/prosemirror";
import { renderInRoute } from "../../../../test/render";
import { ExerciseBuilderScreen } from "./ExerciseBuilderScreen";

const api = vi.hoisted(() => ({
  getExercise: vi.fn(),
  listExerciseTags: vi.fn(),
  listCustomMetrics: vi.fn(),
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  requestUploadUrl: vi.fn(),
  attachDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

// Les appels sont remplacés, les hooks et les clés de cache restent les VRAIS : l'écran s'éprouve
// avec ce qui l'alimente en production.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...api,
}));
vi.mock("@/shared/lib/upload", () => ({ uploadToSignedUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "coach-1", name: "Cédric" } } }),
    signOut: vi.fn(),
  },
}));
vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));

const TITLE = "library.builder.titleLabel";
const SUBMIT_CREATE = "library.builder.submitCreate";
const SUBMIT_EDIT = "library.builder.submitEdit";

const prises: CustomMetric = {
  id: "cm-1",
  label: "Prises",
  unit: null,
  valueType: MetricValueType.NUMBER,
  scale: null,
};

const saved = (over: Partial<ExerciseDto> = {}) =>
  ({
    id: "ex-1",
    coachId: "coach-1",
    title: "Tractions",
    description: null,
    instructions: null,
    blocks: [],
    tags: ["force"],
    documents: [],
    usedInSessionCount: 0,
    ...over,
  }) as unknown as ExerciseDto;

beforeAll(() => {
  installProseMirrorLayout();
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listExerciseTags.mockResolvedValue(["force", "doigts"]);
  api.listCustomMetrics.mockResolvedValue([prises]);
  api.createExercise.mockResolvedValue(saved());
  api.updateExercise.mockResolvedValue(saved());
  api.getExercise.mockResolvedValue(saved());
  api.requestUploadUrl.mockResolvedValue({ uploadUrl: "https://s3.test/put", storagePath: "k" });
  api.attachDocument.mockResolvedValue({ id: "doc-9" });
});

const SHELL_LINKS = ["/", "/messages", "/plans", "/invoices", "/reminders", "/account"];

function create(initialTitle?: string) {
  return renderInRoute(<ExerciseBuilderScreen initialTitle={initialTitle} />, {
    path: "/library/exercises/new",
    links: [...SHELL_LINKS, "/library"],
  });
}

function edit() {
  return renderInRoute(<ExerciseBuilderScreen exerciseId="ex-1" initialTitle={undefined} />, {
    path: "/library/exercises/ex-1",
    links: [...SHELL_LINKS, "/library"],
  });
}

const heading = (view: Awaited<ReturnType<typeof create>>) =>
  view.getAllByRole("heading", { level: 1 })[0]?.textContent;

describe("ExerciseBuilderScreen — chargement", () => {
  it("dit qu'il charge l'exercice demandé, sans formulaire", async () => {
    api.getExercise.mockReturnValue(new Promise(() => undefined));
    const view = await edit();

    expect(view.getByText("common.loading")).toBeInTheDocument();
    expect(heading(view)).toBe("library.builder.loadingTitle");
    expect(view.queryByRole("textbox", { name: TITLE })).not.toBeInTheDocument();
  });

  it("propose de réessayer quand l'exercice ne se charge pas", async () => {
    api.getExercise.mockRejectedValueOnce(new Error("500"));
    const view = await edit();

    await view.user.click(await view.findByRole("button", { name: "common.retry" }));

    await waitFor(() =>
      expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Tractions"),
    );
    expect(api.getExercise).toHaveBeenCalledTimes(2);
  });
});

describe("ExerciseBuilderScreen — création", () => {
  it("s'ouvre en création, sans suppression, enregistrement fermé tant qu'il n'y a pas de titre", async () => {
    const view = await create();

    expect(heading(view)).toBe("library.builder.createTitle");
    expect(view.getByText("library.builder.subtitle")).toBeInTheDocument();
    expect(
      view.queryByRole("button", { name: "library.builder.deleteExercise" }),
    ).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeDisabled();
    expect(view.getByText("library.builder.previewEmpty")).toBeInTheDocument();
  });

  it("reprend le titre cherché, prêt à enregistrer", async () => {
    const view = await create("Planche");

    expect(view.getByRole("textbox", { name: TITLE })).toHaveValue("Planche");
    expect(view.getByRole("button", { name: SUBMIT_CREATE })).toBeEnabled();
  });

  // Accueillir le coach par une erreur qu'il n'a pas encore commise serait hostile : le message
  // attend qu'il quitte le champ vide.
  it("ne réclame le titre qu'une fois le champ quitté vide", async () => {
    const view = await create();
    const title = view.getByRole("textbox", { name: TITLE });

    expect(view.queryByText("library.builder.titleRequired")).not.toBeInTheDocument();
    await view.user.click(title);
    await view.user.tab();
    expect(view.getByText("library.builder.titleRequired")).toBeInTheDocument();

    await view.user.type(title, "Planche");
    expect(view.queryByText("library.builder.titleRequired")).not.toBeInTheDocument();
  });

  it("montre l'exercice dans l'aperçu à mesure qu'il est saisi", async () => {
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Planche");

    expect(view.getByRole("heading", { name: "Planche" })).toBeInTheDocument();
  });

  it("enregistre, le dit, et revient à la bibliothèque", async () => {
    const view = await create();

    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Planche");
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createExercise).toHaveBeenCalledWith(expect.objectContaining({ title: "Planche" }));
    expect(view.getByText("library.builder.saved")).toBeInTheDocument();
  });

  it("dit que l'enregistrement tourne, et ferme les actions le temps qu'il finisse", async () => {
    api.createExercise.mockReturnValue(new Promise(() => undefined));
    const view = await create("Planche");

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByRole("button", { name: "library.builder.saving" })).toBeDisabled();
    expect(view.getByRole("button", { name: "library.builder.cancel" })).toBeDisabled();
  });

  it("reste sur la page et dit l'échec quand l'enregistrement échoue", async () => {
    api.createExercise.mockRejectedValue(new ApiError(400, "Titre trop long", null));
    const view = await create("Planche");

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByText("library.builder.saveFailed")).toBeInTheDocument();
    expect(view.getByText("Titre trop long")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  // #302 : l'exercice est créé, une pièce jointe échoue ensuite. L'écran se présente en édition —
  // c'en est une —, et le réessai mettra à jour au lieu de créer un doublon.
  it("passe en édition quand l'exercice est créé mais qu'une pièce jointe échoue", async () => {
    api.attachDocument.mockRejectedValue(new Error("réseau"));
    const view = await create("Planche");

    await view.user.type(
      view.getByRole("textbox", { name: "library.builder.attachment.addLink" }),
      "https://video.example/tuto",
    );
    await view.user.click(
      view.getByRole("button", { name: "library.builder.attachment.addLinkAction" }),
    );
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    expect(await view.findByRole("button", { name: SUBMIT_EDIT })).toBeInTheDocument();
    expect(heading(view)).toBe("library.builder.editTitle");
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  it("renonce sans rien enregistrer, et revient à la bibliothèque", async () => {
    const view = await create();

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  // Éditeur et aperçu partagent le même magasin : l'image se voit dès qu'elle est posée.
  it("montre dans l'aperçu l'image posée dans la consigne, avant tout enregistrement", async () => {
    const view = await create("Planche");
    await view.findByText("library.builder.instructions");

    await view.user.upload(
      view.container.querySelector('input[accept^="image"]') as HTMLInputElement,
      new File(["x"], "prise.png", { type: "image/png" }),
    );

    // Sans légende, l'`alt` est vide : l'image est décorative, hors de l'arbre d'accessibilité.
    await waitFor(() =>
      expect(view.container.querySelectorAll('img[src="blob:local"]')).toHaveLength(2),
    );
    expect(api.requestUploadUrl).not.toHaveBeenCalled();
  });
});

describe("ExerciseBuilderScreen — ouvert depuis une séance (#303)", () => {
  function fromSession() {
    return renderInRoute(<ExerciseBuilderScreen initialTitle="Planche" fromSessionId="s-1" />, {
      path: "/library/exercises/new",
      links: [...SHELL_LINKS, "/library", "/library/sessions/$sessionId"],
    });
  }

  it("ramène à la séance en y faisant ajouter l'exercice enregistré", async () => {
    api.createExercise.mockResolvedValue(saved({ id: "ex-9", title: "Planche" }));
    const view = await fromSession();

    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/sessions/s-1"));
    expect(view.router.state.location.search).toEqual({ add: "ex-9" });
    expect(view.getByText("library.builder.saved")).toBeInTheDocument();
  });

  it("ramène à la séance sans rien y ajouter quand le coach renonce", async () => {
    const view = await fromSession();

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/sessions/s-1"));
    expect(view.router.state.location.search).toEqual({});
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  // Le détour ne reste pas dans l'historique : un retour arrière ne rouvre pas le formulaire.
  it("remplace la création dans l'historique au lieu de s'y empiler", async () => {
    const view = await fromSession();
    const depth = view.router.history.length;

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library/sessions/s-1"));
    expect(view.router.history.length).toBe(depth);
  });
});

describe("ExerciseBuilderScreen — édition", () => {
  it("s'ouvre sur l'exercice chargé, consigne comprise", async () => {
    api.getExercise.mockResolvedValue(
      saved({
        instructions: [{ type: RichBlockType.PARAGRAPH, content: [{ text: "Coudes serrés" }] }],
      }),
    );
    const view = await edit();

    expect(await view.findByRole("textbox", { name: TITLE })).toHaveValue("Tractions");
    expect(heading(view)).toBe("library.builder.editTitle");
    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeEnabled();
    // Dans l'éditeur ET dans l'aperçu.
    await waitFor(() => expect(view.getAllByText("Coudes serrés")).toHaveLength(2));
  });

  it.each([
    ["annonce les séances qui l'utilisent", 3, "library.builder.usedInSessions"],
    ["tait un décompte nul", 0, "library.builder.subtitle"],
  ])("%s", async (_case, usedInSessionCount, subtitle) => {
    api.getExercise.mockResolvedValue(saved({ usedInSessionCount }));
    const view = await edit();

    expect(await view.findByText(subtitle)).toBeInTheDocument();
  });

  it("met à jour l'exercice, pas un nouveau", async () => {
    const view = await edit();

    await view.user.click(await view.findByRole("button", { name: SUBMIT_EDIT }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.updateExercise).toHaveBeenCalledWith(
      "ex-1",
      expect.objectContaining({ title: "Tractions" }),
    );
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it("montre ses pièces jointes, et elles seules, dans le formulaire et dans l'aperçu", async () => {
    api.getExercise.mockResolvedValue(
      saved({
        documents: [
          {
            id: "d-1",
            type: DocumentType.FILE,
            usage: DocumentUsage.ATTACHMENT,
            url: "https://s.example/p",
            fileName: "programme.pdf",
            mimeType: null,
            createdAt: "2026-09-30T08:00:00.000Z",
          },
          {
            id: "d-2",
            type: DocumentType.FILE,
            usage: DocumentUsage.INSTRUCTION,
            url: "https://s.example/i",
            fileName: "schema.png",
            mimeType: null,
            createdAt: "2026-09-30T08:00:00.000Z",
          },
        ],
      }),
    );
    const view = await edit();

    await waitFor(() =>
      expect(view.getAllByRole("link", { name: "programme.pdf" })).toHaveLength(2),
    );
    expect(view.queryByRole("link", { name: "schema.png" })).not.toBeInTheDocument();
  });

  // Une colonne maison se lit sous le nom du coach : sans ses métriques, elle n'aurait pas de nom.
  it("nomme les colonnes maison des blocs par les métriques du coach", async () => {
    api.getExercise.mockResolvedValue(
      saved({
        blocks: [
          {
            id: "b-1",
            label: null,
            structure: { type: BlockType.FREE },
            metrics: [
              {
                id: "c-1",
                source: MetricSource.CUSTOM,
                customMetricId: "cm-1",
                label: null,
                collapsed: false,
              },
            ],
            rows: [{ id: "r-1", values: { "c-1": 12 } }],
          },
        ] as unknown as ExerciseDto["blocks"],
      }),
    );
    const view = await edit();

    await waitFor(() => expect(view.getAllByText(/^Prises/).length).toBeGreaterThan(0));
  });

  it("supprime l'exercice après confirmation, et revient à la bibliothèque", async () => {
    api.deleteExercise.mockResolvedValue(undefined);
    const view = await edit();

    await view.user.click(
      await view.findByRole("button", { name: "library.builder.deleteExercise" }),
    );
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.deleteExercise).toHaveBeenCalledWith("ex-1");
  });

  // Le 409 « utilisé dans N séances » est actionnable : il se lit, et l'on reste sur l'exercice.
  it("dit pourquoi la suppression est refusée, et reste sur l'exercice", async () => {
    api.deleteExercise.mockRejectedValue(new ApiError(409, "Utilisé dans 2 séances", null));
    const view = await edit();

    await view.user.click(
      await view.findByRole("button", { name: "library.builder.deleteExercise" }),
    );
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    expect(await view.findByText("Utilisé dans 2 séances")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/exercises/ex-1");
  });
});

describe("ExerciseBuilderScreen — saisie non enregistrée (#327)", () => {
  const CANCEL = "library.builder.cancel";
  const STAY = "common.leave.stay";
  const LEAVE = "common.leave.leave";

  it("demande avant d'abandonner une saisie, et « Rester » la garde intacte", async () => {
    const view = await edit();
    const title = await view.findByRole("textbox", { name: TITLE });
    await view.user.type(title, " lestées");

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: STAY }));

    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.router.state.location.pathname).toBe("/library/exercises/ex-1");
    expect(title).toHaveValue("Tractions lestées");
  });

  it("part sans rien enregistrer quand le coach confirme", async () => {
    const view = await create();
    await view.user.type(view.getByRole("textbox", { name: TITLE }), "Planche");

    await view.user.click(view.getByRole("button", { name: CANCEL }));
    await view.user.click(await view.findByRole("button", { name: LEAVE }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(api.createExercise).not.toHaveBeenCalled();
  });

  it("laisse partir sans friction un exercice ouvert sans être modifié", async () => {
    const view = await edit();
    await view.findByRole("textbox", { name: TITLE });

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Ce qui compte est ce qui PARTIRAIT : une frappe effacée ne change rien à l'enregistré.
  it("ne retient plus une saisie revenue à l'enregistré", async () => {
    const view = await edit();
    const title = await view.findByRole("textbox", { name: TITLE });
    await view.user.type(title, "x{Backspace}");

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
  });

  // #302 : l'exercice est créé, le lien n'est pas parti. Partir le perdrait.
  it("retient la sortie quand un envoi s'est interrompu", async () => {
    api.attachDocument.mockRejectedValue(new Error("réseau"));
    const view = await create("Planche");
    await view.user.type(
      view.getByRole("textbox", { name: "library.builder.attachment.addLink" }),
      "https://video.example/tuto",
    );
    await view.user.click(
      view.getByRole("button", { name: "library.builder.attachment.addLinkAction" }),
    );
    await view.user.click(view.getByRole("button", { name: SUBMIT_CREATE }));
    await view.findByRole("button", { name: SUBMIT_EDIT });

    await view.user.click(view.getByRole("button", { name: CANCEL }));

    expect(await view.findByRole("dialog")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  // Supprimer l'exercice rend sa saisie sans objet : la demande serait un contresens.
  it("part sans demander après une suppression, même avec une saisie en cours", async () => {
    api.deleteExercise.mockResolvedValue(undefined);
    const view = await edit();
    await view.user.type(await view.findByRole("textbox", { name: TITLE }), " lestées");

    await view.user.click(view.getByRole("button", { name: "library.builder.deleteExercise" }));
    await view.user.click(view.getByRole("button", { name: "common.confirmDelete" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/library"));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * #566 : « eff » dans le repos, « 31 sfffff » dans une durée d'effort. Le champ gardait la saisie,
 * l'enregistrement partait avec l'ancienne valeur — le coach croyait avoir enregistré ce qu'il
 * voyait.
 */
describe("ExerciseBuilderScreen — saisie refusée (#566)", () => {
  const REST = "library.builder.bandeau.restBetweenSetsSeconds";
  const BLOCKED = "library.builder.refusedBlocksSave";

  const effort = {
    id: "c-effort",
    source: MetricSource.CATALOG,
    key: MetricKey.EFFORT_DURATION,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  };

  /** Une Séries pour le repos du bandeau, un bloc libre pour une ligne qu'on peut retirer. */
  function withBlocks() {
    api.getExercise.mockResolvedValue(
      saved({
        title: "Gainage 306",
        blocks: [
          {
            id: "b-series",
            label: null,
            structure: { type: BlockType.SERIES, setCount: 1, restBetweenSetsSeconds: 30 },
            metrics: [],
            rows: [],
          },
          {
            id: "b-free",
            label: null,
            structure: { type: BlockType.FREE },
            metrics: [effort],
            rows: [{ id: "r-1", values: { "c-effort": 31 } }],
          },
        ] as unknown as ExerciseDto["blocks"],
      }),
    );
    return edit();
  }

  async function refuse(view: Awaited<ReturnType<typeof edit>>, input: HTMLElement, text: string) {
    await view.user.clear(input);
    await view.user.type(input, text);
    await view.user.tab();
  }

  const effortCell = (view: Awaited<ReturnType<typeof edit>>) =>
    view.findByDisplayValue(formatTrainingDuration(31));

  it("ferme l'enregistrement sur une durée refusée du bandeau, et dit pourquoi", async () => {
    const view = await withBlocks();
    const submit = await view.findByRole("button", { name: SUBMIT_EDIT });

    await refuse(view, view.getByLabelText(REST), "eff");

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", BLOCKED);
  });

  it("ferme l'enregistrement sur une cellule refusée, qui le dit sous elle", async () => {
    const view = await withBlocks();
    const cell = await effortCell(view);

    await refuse(view, cell, "31 sfffff");

    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(cell).toHaveAccessibleDescription("library.builder.grid.durationInvalid");
    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeDisabled();
  });

  // Le clic sur le bouton fait sortir du champ : le refus doit le fermer AVANT que le clic n'arrive.
  it("n'envoie rien quand on clique sur Enregistrer sans avoir quitté le champ refusé", async () => {
    const view = await withBlocks();
    const rest = await view.findByLabelText(REST);
    await view.user.clear(rest);
    await view.user.type(rest, "eff");

    await view.user.click(view.getByRole("button", { name: SUBMIT_EDIT }));

    expect(rest).toHaveAttribute("aria-invalid", "true");
    expect(api.updateExercise).not.toHaveBeenCalled();
  });

  it("rouvre l'enregistrement quand la saisie est corrigée, et envoie la valeur corrigée", async () => {
    const view = await withBlocks();
    const rest = await view.findByLabelText(REST);
    await refuse(view, rest, "eff");

    await refuse(view, rest, "45");
    const submit = view.getByRole("button", { name: SUBMIT_EDIT });
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute("title");

    await view.user.click(submit);
    await waitFor(() => expect(api.updateExercise).toHaveBeenCalled());
    const [, sent] = api.updateExercise.mock.calls[0] ?? [];
    expect(sent.blocks[0].structure.restBetweenSetsSeconds).toBe(45);
  });

  it("rouvre l'enregistrement quand la saisie refusée est vidée", async () => {
    const view = await withBlocks();
    const cell = await effortCell(view);
    await refuse(view, cell, "31 sfffff");

    await view.user.clear(cell);
    await view.user.tab();

    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeEnabled();
  });

  // Sans ça, la ligne supprimée laisserait le bouton fermé pour de bon, sans champ où le rouvrir.
  it("rouvre l'enregistrement quand la ligne refusée est retirée", async () => {
    const view = await withBlocks();
    await refuse(view, await effortCell(view), "31 sfffff");

    await view.user.click(view.getByRole("button", { name: "library.builder.grid.removeRow" }));

    expect(view.getByRole("button", { name: SUBMIT_EDIT })).toBeEnabled();
  });

  // Une saisie refusée n'est pas dans le brouillon : la garde de #327 ne la voyait pas.
  it("demande avant de partir en laissant une saisie refusée", async () => {
    const view = await withBlocks();
    await refuse(view, await view.findByLabelText(REST), "eff");

    await view.user.click(view.getByRole("button", { name: "library.builder.cancel" }));

    expect(await view.findByRole("dialog")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/exercises/ex-1");
  });
});

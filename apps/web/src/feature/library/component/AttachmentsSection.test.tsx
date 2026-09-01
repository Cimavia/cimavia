import {
  DocumentType,
  DocumentUsage,
  type ExerciseDto,
  MAX_DOCUMENT_SIZE_BYTES,
} from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { AttachmentsSection } from "./AttachmentsSection";

const { deleteDocumentMock } = vi.hoisted(() => ({ deleteDocumentMock: vi.fn() }));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  deleteDocument: deleteDocumentMock,
}));

const ADD_LINK = "library.builder.attachment.addLink";
const ADD_LINK_ACTION = "library.builder.attachment.addLinkAction";
const REMOVE = "library.builder.attachment.remove";

/** Un fichier dont on force la TAILLE : produire 20 Mo d'octets pour un test serait absurde. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const exerciseWith = (documents: ExerciseDto["documents"]): ExerciseDto =>
  ({ id: "ex-1", title: "Traction", documents }) as ExerciseDto;

const document = (over: Partial<ExerciseDto["documents"][number]>) =>
  ({
    id: "doc-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
    fileName: "notice.pdf",
    url: "https://example.test/notice.pdf",
    ...over,
  }) as ExerciseDto["documents"][number];

function setup(props: Partial<Parameters<typeof AttachmentsSection>[0]> = {}) {
  const handlers = { onPendingFiles: vi.fn(), onPendingLinks: vi.fn() };
  const view = renderWithProviders(
    <AttachmentsSection
      exercise={null}
      pendingFiles={[]}
      pendingLinks={[]}
      progress={{}}
      isSaving={false}
      {...handlers}
      {...props}
    />,
  );
  const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, ...handlers, fileInput };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentsSection", () => {
  it("ne liste que les documents d'usage ATTACHMENT", () => {
    const { getByText, queryByText } = setup({
      exercise: exerciseWith([
        document({ id: "doc-1", fileName: "notice.pdf" }),
        document({ id: "doc-2", fileName: "schema.png", usage: DocumentUsage.INSTRUCTION }),
      ]),
    });

    // Une image POSÉE dans la consigne est bien un document, mais la lister ici la montrerait
    // deux fois — et le coach pourrait la supprimer sans comprendre pourquoi elle disparaît de
    // sa consigne.
    expect(getByText("notice.pdf")).toBeInTheDocument();
    expect(queryByText("schema.png")).not.toBeInTheDocument();
  });

  describe("le choix des fichiers", () => {
    it("accepte un type autorisé et porte son type MIME", async () => {
      const { user, fileInput, onPendingFiles } = setup();

      await user.upload(fileInput, fileOfSize("notice.pdf", "application/pdf", 1024));

      await waitFor(() =>
        expect(onPendingFiles).toHaveBeenCalledWith([
          expect.objectContaining({ mimeType: "application/pdf" }),
        ]),
      );
    });

    it("refuse un type non autorisé sans rien mettre en attente", async () => {
      const { fileInput, onPendingFiles, findByText } = setup();

      // `fireEvent` et non `user.upload` : ce dernier honore l'attribut `accept` et ne peut donc
      // pas exprimer ce cas. Or `accept` n'est PAS une garantie — un glisser-déposer ou un
      // « tous les fichiers » dans la boîte de dialogue système le contourne, et c'est
      // exactement ce contre quoi la garde du composant existe.
      fireEvent.change(fileInput, {
        target: { files: [fileOfSize("notes.txt", "text/plain", 1024)] },
      });

      // Les mêmes contraintes que le serveur, dites ICI : échouer tôt évite un aller-retour pour
      // apprendre ce qu'on savait déjà avant l'envoi.
      expect(await findByText("library.builder.attachment.errorType")).toBeInTheDocument();
      expect(onPendingFiles).not.toHaveBeenCalled();
    });

    it("refuse un fichier au-dessus du plafond de taille", async () => {
      const { user, fileInput, onPendingFiles, findByText } = setup();

      await user.upload(
        fileInput,
        fileOfSize("gros.pdf", "application/pdf", MAX_DOCUMENT_SIZE_BYTES + 1),
      );

      expect(await findByText("library.builder.attachment.errorSize")).toBeInTheDocument();
      expect(onPendingFiles).not.toHaveBeenCalled();
    });

    it("vide le champ pour qu'un même fichier puisse être rechoisi", async () => {
      const { user, fileInput } = setup();

      await user.upload(fileInput, fileOfSize("notice.pdf", "application/pdf", 1024));

      // Sans cette remise à zéro, re-choisir le MÊME fichier ne déclenche aucun `change` : le
      // coach qui a supprimé sa pièce jointe par erreur ne pourrait plus la reposer.
      expect(fileInput.value).toBe("");
    });
  });

  describe("les liens", () => {
    it("ferme l'ajout tant que le brouillon est blanc", async () => {
      const { user, getByRole, getByLabelText } = setup();

      expect(getByRole("button", { name: ADD_LINK_ACTION })).toBeDisabled();

      await user.type(getByLabelText(ADD_LINK), "   ");

      expect(getByRole("button", { name: ADD_LINK_ACTION })).toBeDisabled();
    });

    it("ajoute le lien à la suite et vide le champ", async () => {
      const { user, getByRole, getByLabelText, onPendingLinks } = setup({
        pendingLinks: ["https://example.test/a"],
      });

      await user.type(getByLabelText(ADD_LINK), "  https://example.test/b  ");
      await user.click(getByRole("button", { name: ADD_LINK_ACTION }));

      expect(onPendingLinks).toHaveBeenCalledWith([
        "https://example.test/a",
        "https://example.test/b",
      ]);
      expect(getByLabelText(ADD_LINK)).toHaveValue("");
    });
  });

  describe("la suppression d'un document déjà enregistré", () => {
    it("désigne l'exercice ET le document", async () => {
      deleteDocumentMock.mockResolvedValue(undefined);
      const { user, getByRole } = setup({
        exercise: exerciseWith([document({ id: "doc-1" })]),
      });

      await user.click(getByRole("button", { name: REMOVE }));

      await waitFor(() => expect(deleteDocumentMock).toHaveBeenCalledWith("ex-1", "doc-1"));
    });
  });

  describe("l'envoi en cours", () => {
    it("montre la barre dès zéro pour cent", () => {
      const pending = {
        id: "pf-1",
        file: fileOfSize("notice.pdf", "application/pdf", 1024),
        mimeType: "application/pdf",
      } as const;
      const { getByRole } = setup({ pendingFiles: [pending], progress: { "pf-1": 0 } });

      // `0` est une progression, pas une absence : la masquer laisserait croire que rien n'a
      // commencé (règle dure n°5).
      expect(
        getByRole("progressbar", { name: "library.builder.attachment.uploading" }),
      ).toHaveAttribute("aria-valuenow", "0");
    });

    it("ne montre aucune barre tant que rien n'est parti", () => {
      const pending = {
        id: "pf-1",
        file: fileOfSize("notice.pdf", "application/pdf", 1024),
        mimeType: "application/pdf",
      } as const;
      const { queryByRole } = setup({ pendingFiles: [pending], progress: {} });

      expect(queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });
});

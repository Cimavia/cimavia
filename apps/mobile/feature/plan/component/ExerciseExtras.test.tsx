import type { ScheduledSessionExerciseDto } from "@cmv/shared";
import { DocumentType, DocumentUsage, RichBlockType } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { press, pressButton, renderRn } from "../../../test/render";

let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const openDocument = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "opened");
const freshDocumentUrl = vi.fn<(...args: unknown[]) => Promise<string | null>>();
vi.mock("@/feature/plan/lib/open-document", () => ({
  openDocument: (...args: unknown[]) => openDocument(...args),
  freshDocumentUrl: (...args: unknown[]) => freshDocumentUrl(...args),
}));

/** Le disque est espionné : c'est le coût que la consigne repliée ne doit pas payer. */
const localDocumentUri = vi.fn<(...args: unknown[]) => string | null>(() => null);
vi.mock("@/shared/lib/document-cache", () => ({
  localDocumentUri: (...args: unknown[]) => localDocumentUri(...args),
}));

const { ExerciseExtras } = await import("./ExerciseExtras");

type Exercise = Pick<ScheduledSessionExerciseDto, "id" | "instructions" | "documents">;

const ATTACHMENT: ScheduledSessionExerciseDto["documents"][number] = {
  id: "doc-1",
  type: DocumentType.FILE,
  usage: DocumentUsage.ATTACHMENT,
  url: "https://storage.test/signed",
  fileName: "progression.pdf",
  mimeType: "application/pdf",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderExtras(over: Partial<Exercise> = {}) {
  const exercise: Exercise = { id: "ex-1", instructions: null, documents: [ATTACHMENT], ...over };
  return renderRn(<ExerciseExtras exercise={exercise} planId="plan-1" sessionId="session-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  reachable = true;
  openDocument.mockResolvedValue("opened");
});

describe("ExerciseExtras — pièces jointes", () => {
  it("ouvre la pièce jointe avec le cycle et l'état du réseau", async () => {
    const { container } = renderExtras();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
    expect(openDocument).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ id: "doc-1" }),
      true,
      expect.any(Function),
    );
  });

  /** La re-signature vise la séance affichée et le document tapé — pas un autre (#307). */
  it("re-signe le document tapé dans la séance affichée", async () => {
    const { container, queryClient } = renderExtras();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
    const freshUrl = openDocument.mock.calls[0]?.[3] as () => Promise<string | null>;
    await freshUrl();
    expect(freshDocumentUrl).toHaveBeenCalledWith(queryClient, "session-1", "doc-1");
  });

  it("ne dit rien quand la pièce jointe s'ouvre", async () => {
    const { container } = renderExtras();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalled());
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
    expect(screen.queryByText("plan.session.documentUnavailable")).toBeNull();
  });

  /**
   * Le repli explicite de l'issue : un document jamais descendu, tapé sans réseau, doit DIRE
   * pourquoi il ne s'ouvre pas — pas échouer en silence.
   */
  it("explique le hors-réseau sous la pièce jointe concernée", async () => {
    reachable = false;
    openDocument.mockResolvedValue("offline");
    const { container } = renderExtras();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();
  });

  it("distingue une ouverture refusée d'une absence de réseau", async () => {
    openDocument.mockResolvedValue("failed");
    const { container } = renderExtras();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentUnavailable")).toBeTruthy();
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
  });

  /**
   * L'échec ne doit pas SURVIVRE à une ouverture réussie : l'athlète qui retrouve du réseau et
   * retape doit voir le message disparaître, sans quoi il croirait l'échec toujours vrai.
   */
  it("efface le message quand une nouvelle tentative aboutit", async () => {
    openDocument.mockResolvedValue("offline");
    const { container } = renderExtras();

    pressButton(container, "progression.pdf");
    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();

    openDocument.mockResolvedValue("opened");
    pressButton(container, "progression.pdf");

    await waitFor(() => expect(screen.queryByText("plan.session.documentOffline")).toBeNull());
  });

  it("nomme un lien sans nom de fichier", () => {
    renderExtras({ documents: [{ ...ATTACHMENT, type: DocumentType.LINK, fileName: null }] });

    expect(screen.getByText("plan.session.link")).toBeTruthy();
  });
});

describe("ExerciseExtras — la consigne", () => {
  const instructions = [{ type: RichBlockType.PARAGRAPH, content: [{ text: "Pieds à plat." }] }];

  it.each([
    ["absente", null],
    ["vide", []],
  ])("n'offre aucun lien vers une consigne %s", (_, value) => {
    renderExtras({ instructions: value as never });

    expect(screen.queryByText("plan.session.showInstructions")).toBeNull();
  });

  /** Repliée par défaut : l'athlète au mur veut d'abord son dosage. */
  it("replie la consigne, puis la déplie et la replie au tap", () => {
    renderExtras({ instructions: instructions as never });
    expect(screen.queryByText("Pieds à plat.")).toBeNull();

    press(screen.getByText("plan.session.showInstructions"));
    expect(screen.getByText("Pieds à plat.")).toBeTruthy();

    press(screen.getByText("plan.session.hideInstructions"));
    expect(screen.queryByText("Pieds à plat.")).toBeNull();
  });
  /**
   * Le résolveur naît à l'ouverture : une séance de quinze exercices repliés n'interroge pas le
   * disque, et une réouverture relit un fichier que la passe hors-ligne a descendu entre-temps.
   */
  it("n'interroge le disque qu'à l'ouverture, et à nouveau à chaque réouverture", () => {
    renderExtras({
      instructions: instructions as never,
      documents: [{ ...ATTACHMENT, id: "media-1", usage: DocumentUsage.INSTRUCTION }],
    });
    expect(localDocumentUri).not.toHaveBeenCalled();

    press(screen.getByText("plan.session.showInstructions"));
    expect(localDocumentUri).toHaveBeenCalledTimes(1);

    press(screen.getByText("plan.session.hideInstructions"));
    press(screen.getByText("plan.session.showInstructions"));
    expect(localDocumentUri).toHaveBeenCalledTimes(2);
  });

  /**
   * L'image de la consigne se résout parmi les documents de l'exercice : sans fichier descendu
   * sur l'appareil, c'est l'URL signée du document INSTRUCTION qui s'affiche.
   */
  it("affiche l'image de la consigne depuis le document qui la porte", () => {
    const image = {
      ...ATTACHMENT,
      id: "media-1",
      usage: DocumentUsage.INSTRUCTION,
      url: "https://storage.test/prise.png",
      fileName: "prise.png",
      mimeType: "image/png",
    };
    const { container } = renderExtras({
      instructions: [{ type: RichBlockType.IMAGE, mediaId: "media-1", caption: null }] as never,
      documents: [image],
    });

    press(screen.getByText("plan.session.showInstructions"));

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.test/prise.png",
    );
  });
});

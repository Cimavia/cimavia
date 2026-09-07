import { DocumentType, DocumentUsage, type ExerciseDocumentDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const localDocumentUri = vi.fn<() => string | null>(() => null);
vi.mock("@/shared/lib/document-cache", () => ({ localDocumentUri: () => localDocumentUri() }));

const isAvailableAsync = vi.fn<() => Promise<boolean>>(async () => true);
const shareAsync = vi.fn<(uri: string, options: object) => Promise<void>>(async () => undefined);
vi.mock("expo-sharing", () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (uri: string, options: object) => shareAsync(uri, options),
}));

const openURL = vi.fn<(url: string) => Promise<void>>(async () => undefined);
vi.mock("react-native", () => ({ Linking: { openURL: (url: string) => openURL(url) } }));

const { openDocument } = await import("./open-document");

const LOCAL_URI = "file:///documents/plan-documents/plan-1/doc-1.pdf";

function attachment(overrides: Partial<ExerciseDocumentDto> = {}): ExerciseDocumentDto {
  return {
    id: "doc-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
    url: "https://storage.test/signed",
    fileName: "progression.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localDocumentUri.mockReturnValue(null);
  isAvailableAsync.mockResolvedValue(true);
  shareAsync.mockResolvedValue(undefined);
  openURL.mockResolvedValue(undefined);
});

describe("openDocument — fichier sur l'appareil", () => {
  /**
   * Le cas que #95 existe pour servir : en salle, sans réseau, la pièce jointe s'ouvre quand même.
   */
  it("ouvre le fichier local hors réseau", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await expect(openDocument("plan-1", attachment(), false)).resolves.toBe("opened");

    expect(shareAsync).toHaveBeenCalledWith(LOCAL_URI, { mimeType: "application/pdf" });
    expect(openURL).not.toHaveBeenCalled();
  });

  /**
   * Même en ligne : le fichier local ne périme pas, là où l'URL signée dure cinq minutes. Aller
   * au storage quand l'octet est déjà là n'ajouterait qu'une latence et un risque de 403.
   */
  it("préfère le fichier local même en ligne", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).not.toHaveBeenCalled();
  });

  it("n'invente pas de type mime quand le document n'en porte pas", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await openDocument("plan-1", attachment({ mimeType: null }), false);

    expect(shareAsync).toHaveBeenCalledWith(LOCAL_URI, {});
  });

  /**
   * Partage indisponible sur l'appareil : ce n'est pas une raison de renoncer si le réseau, lui,
   * est là. L'URL signée reste une voie.
   */
  it("retombe sur l'url signée quand le partage est indisponible", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    isAvailableAsync.mockResolvedValue(false);

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith("https://storage.test/signed");
  });

  it("retombe sur l'url signée quand le partage échoue", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    shareAsync.mockRejectedValue(new Error("refusé"));

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith("https://storage.test/signed");
  });
});

describe("openDocument — rien sur l'appareil", () => {
  it("ouvre l'url signée en ligne", async () => {
    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith("https://storage.test/signed");
  });

  /**
   * Le repli EXPLICITE que réclamait l'issue : sans fichier ni réseau, on le DIT. Ouvrir l'URL
   * signée mènerait à une page d'erreur du storage, en XML brut.
   */
  it("annonce le hors-réseau plutôt que d'ouvrir une url morte", async () => {
    await expect(openDocument("plan-1", attachment(), false)).resolves.toBe("offline");

    expect(openURL).not.toHaveBeenCalled();
  });

  it("rend failed quand l'ouverture est refusée en ligne", async () => {
    openURL.mockRejectedValue(new Error("aucun lecteur"));

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("failed");
  });
});

describe("openDocument — lien externe", () => {
  it("ouvre le lien sans jamais consulter le magasin", async () => {
    const link = attachment({ type: DocumentType.LINK, url: "https://youtube.test/demo" });

    await expect(openDocument("plan-1", link, true)).resolves.toBe("opened");

    expect(localDocumentUri).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith("https://youtube.test/demo");
  });

  /**
   * Un lien externe n'a pas de copie possible : hors réseau il n'y a rien à ouvrir, et le dire
   * vaut mieux que lancer un navigateur sur une page blanche.
   */
  it("annonce le hors-réseau pour un lien externe", async () => {
    const link = attachment({ type: DocumentType.LINK });

    await expect(openDocument("plan-1", link, false)).resolves.toBe("offline");
  });
});

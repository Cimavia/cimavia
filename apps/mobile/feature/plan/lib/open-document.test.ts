import { DocumentType, DocumentUsage, type ExerciseDocumentDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const localDocumentUri = vi.fn<() => string | null>(() => null);
vi.mock("@/shared/lib/document-cache", () => ({ localDocumentUri: () => localDocumentUri() }));

let contentUri = "content://fr.cimavia.app/doc-1.pdf";
vi.mock("expo-file-system", () => ({
  File: class {
    get contentUri() {
      return contentUri;
    }
  },
}));

const startActivityAsync = vi.fn<(action: string, params: object) => Promise<unknown>>(
  async () => ({ resultCode: -1 }),
);
vi.mock("expo-intent-launcher", () => ({
  startActivityAsync: (action: string, params: object) => startActivityAsync(action, params),
}));

const isAvailableAsync = vi.fn<() => Promise<boolean>>(async () => true);
const shareAsync = vi.fn<(uri: string, options: object) => Promise<void>>(async () => undefined);
vi.mock("expo-sharing", () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (uri: string, options: object) => shareAsync(uri, options),
}));

let platform = "android";
const openURL = vi.fn<(url: string) => Promise<void>>(async () => undefined);
vi.mock("react-native", () => ({
  Linking: { openURL: (url: string) => openURL(url) },
  Platform: {
    get OS() {
      return platform;
    },
  },
}));

const { openDocument } = await import("./open-document");

const LOCAL_URI = "file:///documents/plan-documents/plan-1/doc-1.pdf";
const SIGNED_URL = "https://storage.test/signed";

function attachment(overrides: Partial<ExerciseDocumentDto> = {}): ExerciseDocumentDto {
  return {
    id: "doc-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
    url: SIGNED_URL,
    fileName: "progression.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  platform = "android";
  contentUri = "content://fr.cimavia.app/doc-1.pdf";
  localDocumentUri.mockReturnValue(null);
  isAvailableAsync.mockResolvedValue(true);
  openURL.mockResolvedValue(undefined);
});

describe("openDocument — android", () => {
  /**
   * Le correctif du retour bêta : la première version passait par `Sharing.shareAsync`, qui
   * proposait d'ENVOYER le PDF à ses contacts au lieu de le montrer. `ACTION_VIEW` est le geste
   * qui ouvre, et il exige le `content://` — un `file://` du sandbox lèverait
   * `FileUriExposedException`.
   */
  it("ouvre le fichier local par une intention de lecture", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await expect(openDocument("plan-1", attachment(), false)).resolves.toBe("opened");

    expect(startActivityAsync).toHaveBeenCalledWith("android.intent.action.VIEW", {
      data: "content://fr.cimavia.app/doc-1.pdf",
      flags: 1,
      type: "application/pdf",
    });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  /** Sans le drapeau, le lecteur reçoit une uri qu'il n'a pas le droit de lire. */
  it("accorde la permission de lecture sur l'uri transmise", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await openDocument("plan-1", attachment(), false);

    expect(startActivityAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flags: 1 }),
    );
  });

  it("laisse android déduire le type quand le document n'en porte pas", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await openDocument("plan-1", attachment({ mimeType: null }), false);

    expect(startActivityAsync).toHaveBeenCalledWith("android.intent.action.VIEW", {
      data: "content://fr.cimavia.app/doc-1.pdf",
      flags: 1,
    });
  });

  it("retombe sur l'url signée quand aucun lecteur ne sait ouvrir le type", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    startActivityAsync.mockRejectedValue(new Error("ActivityNotFound"));

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  it("retombe sur l'url signée quand le fichier ne fournit pas de content uri", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    contentUri = "";

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  /** Un lecteur absent ET pas de réseau : on le DIT, plutôt que d'échouer en silence. */
  it("annonce le hors-réseau quand l'ouverture locale échoue sans réseau", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    startActivityAsync.mockRejectedValue(new Error("ActivityNotFound"));

    await expect(openDocument("plan-1", attachment(), false)).resolves.toBe("offline");
  });
});

describe("openDocument — ios", () => {
  /**
   * iOS n'a pas d'`ACTION_VIEW` : `UIActivityViewController` est la voie documentée, et sa feuille
   * porte un aperçu Quick Look en tête. Asymétrie assumée, faute d'embarquer un visionneur.
   */
  it("passe par la feuille système, seule voie disponible", async () => {
    platform = "ios";
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await expect(openDocument("plan-1", attachment(), false)).resolves.toBe("opened");

    expect(shareAsync).toHaveBeenCalledWith(LOCAL_URI, { mimeType: "application/pdf" });
    expect(startActivityAsync).not.toHaveBeenCalled();
  });

  it("retombe sur l'url signée quand la feuille est indisponible", async () => {
    platform = "ios";
    localDocumentUri.mockReturnValue(LOCAL_URI);
    isAvailableAsync.mockResolvedValue(false);

    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });
});

describe("openDocument — rien sur l'appareil", () => {
  it("ouvre l'url signée en ligne", async () => {
    await expect(openDocument("plan-1", attachment(), true)).resolves.toBe("opened");

    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  /**
   * Le repli EXPLICITE que réclamait l'issue : sans fichier ni réseau, on le dit. Ouvrir l'url
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

  it("annonce le hors-réseau pour un lien externe", async () => {
    const link = attachment({ type: DocumentType.LINK });

    await expect(openDocument("plan-1", link, false)).resolves.toBe("offline");
  });
});

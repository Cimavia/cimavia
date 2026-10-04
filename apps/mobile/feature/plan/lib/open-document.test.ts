import {
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  type ScheduledSessionDto,
} from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const localDocumentUri = vi.fn<() => string | null>(() => null);
vi.mock("@/shared/lib/document-cache", () => ({ localDocumentUri: () => localDocumentUri() }));

/** Une `Error` ici fait lever le fichier, comme le natif sur un chemin hors du sandbox. */
let contentUri: string | Error = "content://fr.cimavia.app/doc-1.pdf";
vi.mock("expo-file-system", () => ({
  File: class {
    get contentUri() {
      if (contentUri instanceof Error) throw contentUri;
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

const usableSession = vi.fn<(...args: unknown[]) => Promise<ScheduledSessionDto>>();
vi.mock("@/feature/plan/lib/usable-session", () => ({
  usableSession: (...args: unknown[]) => usableSession(...args),
}));

const { freshDocumentUrl, openDocument } = await import("./open-document");

const LOCAL_URI = "file:///documents/plan-documents/plan-1/doc-1.pdf";
const SIGNED_URL = "https://storage.test/signed";
const RESIGNED_URL = "https://storage.test/resigned";

/** La re-signature que l'écran fournit : elle rend l'URL fraîche du document. */
const freshUrl = vi.fn<() => Promise<string | null>>();

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
  freshUrl.mockResolvedValue(SIGNED_URL);
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

    await expect(openDocument("plan-1", attachment(), false, freshUrl)).resolves.toBe("opened");

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

    await openDocument("plan-1", attachment(), false, freshUrl);

    expect(startActivityAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flags: 1 }),
    );
  });

  it("laisse android déduire le type quand le document n'en porte pas", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await openDocument("plan-1", attachment({ mimeType: null }), false, freshUrl);

    expect(startActivityAsync).toHaveBeenCalledWith("android.intent.action.VIEW", {
      data: "content://fr.cimavia.app/doc-1.pdf",
      flags: 1,
    });
  });

  it("retombe sur l'url signée quand aucun lecteur ne sait ouvrir le type", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    startActivityAsync.mockRejectedValue(new Error("ActivityNotFound"));

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  it("retombe sur l'url signée quand le fichier ne fournit pas de content uri", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    contentUri = "";

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  it("retombe sur l'url signée quand le fichier refuse de fournir son content uri", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    contentUri = new Error("hors du sandbox");

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  /** Un lecteur absent ET pas de réseau : on le DIT, plutôt que d'échouer en silence. */
  it("annonce le hors-réseau quand l'ouverture locale échoue sans réseau", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    startActivityAsync.mockRejectedValue(new Error("ActivityNotFound"));

    await expect(openDocument("plan-1", attachment(), false, freshUrl)).resolves.toBe("offline");
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

    await expect(openDocument("plan-1", attachment(), false, freshUrl)).resolves.toBe("opened");

    expect(shareAsync).toHaveBeenCalledWith(LOCAL_URI, { mimeType: "application/pdf" });
    expect(startActivityAsync).not.toHaveBeenCalled();
  });

  it("laisse la feuille déduire le type quand le document n'en porte pas", async () => {
    platform = "ios";
    localDocumentUri.mockReturnValue(LOCAL_URI);

    await openDocument("plan-1", attachment({ mimeType: null }), false, freshUrl);

    expect(shareAsync).toHaveBeenCalledWith(LOCAL_URI, {});
  });

  it("retombe sur l'url signée quand la feuille lève", async () => {
    platform = "ios";
    localDocumentUri.mockReturnValue(LOCAL_URI);
    shareAsync.mockRejectedValueOnce(new Error("feuille fermée par l'OS"));

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  it("retombe sur l'url signée quand la feuille est indisponible", async () => {
    platform = "ios";
    localDocumentUri.mockReturnValue(LOCAL_URI);
    isAvailableAsync.mockResolvedValue(false);

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });
});

describe("openDocument — rien sur l'appareil", () => {
  it("ouvre l'url signée en ligne", async () => {
    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(SIGNED_URL);
  });

  /**
   * Le repli EXPLICITE que réclamait l'issue : sans fichier ni réseau, on le dit. Ouvrir l'url
   * signée mènerait à une page d'erreur du storage, en XML brut.
   */
  it("annonce le hors-réseau plutôt que d'ouvrir une url morte", async () => {
    await expect(openDocument("plan-1", attachment(), false, freshUrl)).resolves.toBe("offline");

    expect(openURL).not.toHaveBeenCalled();
  });

  /**
   * #307 : la séance ouverte depuis plus de cinq minutes porte une URL morte. Celle qu'on ouvre
   * est celle que la re-signature vient de rendre, jamais celle du cache.
   */
  it("ouvre l'url re-signée plutôt que celle du cache", async () => {
    freshUrl.mockResolvedValue(RESIGNED_URL);

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("opened");

    expect(openURL).toHaveBeenCalledWith(RESIGNED_URL);
  });

  it("rend failed sans rien ouvrir quand la re-signature échoue", async () => {
    freshUrl.mockResolvedValue(null);

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("failed");

    expect(openURL).not.toHaveBeenCalled();
  });

  it("ne tente pas de re-signer hors réseau", async () => {
    await openDocument("plan-1", attachment(), false, freshUrl);

    expect(freshUrl).not.toHaveBeenCalled();
  });

  it("ne re-signe pas un document déjà ouvert depuis l'appareil", async () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    startActivityAsync.mockResolvedValue({ resultCode: -1 });

    await openDocument("plan-1", attachment(), true, freshUrl);

    expect(freshUrl).not.toHaveBeenCalled();
  });

  it("rend failed quand l'ouverture est refusée en ligne", async () => {
    openURL.mockRejectedValue(new Error("aucun lecteur"));

    await expect(openDocument("plan-1", attachment(), true, freshUrl)).resolves.toBe("failed");
  });
});

describe("openDocument — lien externe", () => {
  it("ouvre le lien sans jamais consulter le magasin", async () => {
    const link = attachment({ type: DocumentType.LINK, url: "https://youtube.test/demo" });

    await expect(openDocument("plan-1", link, true, freshUrl)).resolves.toBe("opened");

    expect(localDocumentUri).not.toHaveBeenCalled();
    expect(freshUrl).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith("https://youtube.test/demo");
  });

  it("annonce le hors-réseau pour un lien externe", async () => {
    const link = attachment({ type: DocumentType.LINK });

    await expect(openDocument("plan-1", link, false, freshUrl)).resolves.toBe("offline");
  });
});

describe("freshDocumentUrl", () => {
  const queryClient = {} as QueryClient;

  function sessionWith(documents: ExerciseDocumentDto[]): ScheduledSessionDto {
    return { exercises: [{ documents }] } as unknown as ScheduledSessionDto;
  }

  it("rend l'url du document dans la séance rechargée", async () => {
    usableSession.mockResolvedValue(sessionWith([attachment({ url: RESIGNED_URL })]));

    await expect(freshDocumentUrl(queryClient, "s-1", "doc-1")).resolves.toBe(RESIGNED_URL);
    expect(usableSession).toHaveBeenCalledWith(queryClient, "s-1");
  });

  it("rend null quand le coach a retiré le document depuis", async () => {
    usableSession.mockResolvedValue(sessionWith([]));

    await expect(freshDocumentUrl(queryClient, "s-1", "doc-1")).resolves.toBeNull();
  });

  it("rend null quand la séance ne se recharge pas", async () => {
    usableSession.mockRejectedValue(new Error("réseau"));

    await expect(freshDocumentUrl(queryClient, "s-1", "doc-1")).resolves.toBeNull();
  });
});

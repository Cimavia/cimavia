import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un disque en mémoire, comme pour `document-cache` : ce qui s'éprouve ici est QUAND le fichier
 * est descendu, gardé ou jeté — un mock qui répond toujours « il existe » n'en dirait rien.
 */
const CACHE = "file:///cache";
const ROOT = `${CACHE}/message-files`;

// Chaque fichier écrit, avec sa taille : c'est elle qui dit si la copie est entière.
const files = new Map<string, number>();
let downloadFails = false;
// Retient le téléchargement en vol, pour y glisser une déconnexion ou un second tap.
let downloadGate: Promise<void> = Promise.resolve();

function join(parts: readonly (string | { uri: string })[]): string {
  return parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
}

class FakeDirectory {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return true;
  }
  create() {}
  delete() {
    for (const uri of [...files.keys()]) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
  }
}

const downloads = vi.fn();

class FakeFile {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri) ?? 0;
  }
  delete() {
    files.delete(this.uri);
  }
  static async downloadFileAsync(url: string, destination: FakeFile) {
    downloads(url, destination.uri);
    await downloadGate;
    // Le vrai écrit au fil de l'eau : coupé en route, il laisse un fichier tronqué.
    if (downloadFails) {
      files.set(destination.uri, SIZE / 2);
      throw new Error("connexion perdue");
    }
    files.set(destination.uri, SIZE);
  }
}

vi.mock("expo-file-system", () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { cache: { uri: CACHE } },
}));

const openLocalFile = vi.fn(async (_uri: string, _mime: string | null) => true);
vi.mock("@/shared/lib/open-file", () => ({
  openLocalFile: (uri: string, mime: string | null) => openLocalFile(uri, mime),
}));

const { discardPickedFile, openMessageFile, purgeMessageFiles } = await import("./message-file");

const SIZE = 2_048;
const PDF = { fileName: "Plan.Semaine.PDF", mimeType: "application/pdf", sizeBytes: SIZE };
const LOCAL = `${ROOT}/m-1.pdf`;
const PICKED = `${CACHE}/DocumentPicker/0b8e.pdf`;
const URL = "https://s3.test/plan.pdf?X-Amz-Date=120000";
const resolveUrl = vi.fn(async (): Promise<string | null> => URL);

beforeEach(() => {
  files.clear();
  downloadFails = false;
  downloadGate = Promise.resolve();
  vi.clearAllMocks();
  openLocalFile.mockResolvedValue(true);
  resolveUrl.mockResolvedValue(URL);
});

describe("openMessageFile", () => {
  it("descend le fichier sous son extension, puis le remet à l'OS", async () => {
    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("opened");

    expect(downloads).toHaveBeenCalledWith(URL, LOCAL);
    expect(openLocalFile).toHaveBeenCalledWith(LOCAL, "application/pdf");
  });

  it("rouvre le fichier déjà là sans réseau ni re-signature", async () => {
    files.set(LOCAL, SIZE);

    await expect(openMessageFile("m-1", PDF, false, resolveUrl)).resolves.toBe("opened");

    expect(resolveUrl).not.toHaveBeenCalled();
    expect(downloads).not.toHaveBeenCalled();
  });

  it("dit « hors ligne » quand le fichier n'est pas là et qu'il n'y a pas de réseau", async () => {
    await expect(openMessageFile("m-1", PDF, false, resolveUrl)).resolves.toBe("offline");
    expect(resolveUrl).not.toHaveBeenCalled();
  });

  it("échoue sans rien descendre quand l'URL ne se re-signe pas", async () => {
    resolveUrl.mockResolvedValue(null);

    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("failed");
    expect(downloads).not.toHaveBeenCalled();
  });

  it("échoue quand la re-signature lève", async () => {
    resolveUrl.mockRejectedValue(new Error("réseau"));
    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("failed");
  });

  it("jette le fichier tronqué d'un téléchargement coupé : le tap suivant le redescend", async () => {
    downloadFails = true;

    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("failed");

    expect(files.has(LOCAL)).toBe(false);
    expect(openLocalFile).not.toHaveBeenCalled();
  });

  /** Un processus tué en plein téléchargement laisse le fichier à moitié, à sa place définitive. */
  it("jette une copie tronquée et la redescend", async () => {
    files.set(LOCAL, SIZE / 2);

    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("opened");

    expect(downloads).toHaveBeenCalledOnce();
    expect(files.get(LOCAL)).toBe(SIZE);
  });

  it("ne prend pas une copie tronquée pour le fichier, même hors ligne", async () => {
    files.set(LOCAL, SIZE / 2);

    await expect(openMessageFile("m-1", PDF, false, resolveUrl)).resolves.toBe("offline");
    expect(openLocalFile).not.toHaveBeenCalled();
  });

  it("échoue quand aucun lecteur ne sait ouvrir le fichier", async () => {
    openLocalFile.mockResolvedValue(false);
    await expect(openMessageFile("m-1", PDF, true, resolveUrl)).resolves.toBe("failed");
  });

  it("refuse un identifiant qui composerait un autre chemin", async () => {
    await expect(openMessageFile("../m-1", PDF, true, resolveUrl)).resolves.toBe("failed");
    expect(downloads).not.toHaveBeenCalled();
  });

  it("ne descend qu'une fois pour deux taps rapprochés", async () => {
    let release = () => {};
    downloadGate = new Promise((resolve) => {
      release = resolve;
    });

    const first = openMessageFile("m-1", PDF, true, resolveUrl);
    await vi.waitFor(() => expect(downloads).toHaveBeenCalled());
    // Le fichier est déjà sur le disque, à moitié : le second tap attend le premier.
    files.set(LOCAL, SIZE / 2);
    const second = openMessageFile("m-1", PDF, true, resolveUrl);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual(["opened", "opened"]);
    expect(downloads).toHaveBeenCalledTimes(1);
  });
});

describe("discardPickedFile", () => {
  it("efface la copie laissée par le sélecteur", () => {
    files.set(PICKED, SIZE);
    discardPickedFile(PICKED);
    expect(files.has(PICKED)).toBe(false);
  });

  it("ne touche à rien hors du dossier du sélecteur", () => {
    const original = "file:///storage/emulated/0/Download/plan.pdf";
    files.set(original, SIZE);
    discardPickedFile(original);
    expect(files.has(original)).toBe(true);
  });
});

describe("purgeMessageFiles", () => {
  it("efface les fichiers descendus et les copies du sélecteur", () => {
    files.set(LOCAL, SIZE);
    files.set(PICKED, SIZE);
    purgeMessageFiles();
    expect(files.size).toBe(0);
  });

  /** Le compte suivant ne doit pas hériter du fichier qu'un téléchargement en vol finissait d'écrire. */
  it("jette ce qu'un téléchargement lancé avant la purge finit d'écrire", async () => {
    let release = () => {};
    downloadGate = new Promise((resolve) => {
      release = resolve;
    });

    const pending = openMessageFile("m-1", PDF, true, resolveUrl);
    await vi.waitFor(() => expect(downloads).toHaveBeenCalled());
    purgeMessageFiles();
    release();

    await expect(pending).resolves.toBe("failed");
    expect(files.has(LOCAL)).toBe(false);
  });
});

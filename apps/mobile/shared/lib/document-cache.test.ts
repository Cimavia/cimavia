import { DocumentType, DocumentUsage, type ExerciseDocumentDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un système de fichiers en mémoire, plutôt que le mock minimal du harnais : ce module ne fait
 * QUE du système de fichiers, et un mock qui répond toujours « le fichier existe » ne prouverait
 * rien de sa logique de présence, de purge ou de renommage.
 */
const DOCUMENTS = "file:///documents";

const files = new Set<string>();
const directories = new Set<string>();

function join(parts: readonly (string | { uri: string })[]): string {
  return parts
    .map((part) => (typeof part === "string" ? part : part.uri).replace(/\/+$/, ""))
    .join("/");
}

class FakeDirectory {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return directories.has(this.uri);
  }
  /** `intermediates: true` crée la CHAÎNE : sans ça le double laisserait la racine inexistante. */
  create() {
    let current = this.uri;
    while (current.length > DOCUMENTS.length && current.startsWith(DOCUMENTS)) {
      directories.add(current);
      current = current.slice(0, current.lastIndexOf("/"));
    }
  }
  list() {
    return [...directories]
      .filter(
        (uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes("/"),
      )
      .map((uri) => new FakeDirectory(uri));
  }
  delete() {
    for (const uri of [...directories]) {
      if (uri === this.uri || uri.startsWith(`${this.uri}/`)) directories.delete(uri);
    }
    for (const uri of [...files]) {
      if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    }
  }
}

class FakeFile {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  static downloadFileAsync = vi.fn(async (_url: string, destination: FakeFile) => {
    files.add(destination.uri);
    return destination;
  });
}

vi.mock("expo-file-system", () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { document: { uri: DOCUMENTS } },
}));

const { cacheDocument, localDocumentUri, purgeAllDocuments, purgePlansExcept, storeGeneration } =
  await import("./document-cache");

const ROOT = `${DOCUMENTS}/plan-documents`;

function fileDocument(overrides: Partial<ExerciseDocumentDto> = {}): ExerciseDocumentDto {
  return {
    id: "doc-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
    url: "https://storage.test/signed?x=1",
    fileName: "progression-charge.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  files.clear();
  directories.clear();
  FakeFile.downloadFileAsync.mockClear();
});

describe("localDocumentUri", () => {
  it("rend null tant que le document n'est pas descendu", () => {
    expect(localDocumentUri("plan-1", fileDocument())).toBeNull();
  });

  it("rend le fichier local une fois descendu", async () => {
    await cacheDocument("plan-1", fileDocument());

    expect(localDocumentUri("plan-1", fileDocument())).toBe(`${ROOT}/plan-1/doc-1.pdf`);
  });

  /**
   * Deux cycles peuvent porter des copies du même document de bibliothèque. Le rangement par
   * cycle est ce qui rend la purge de l'un sans effet sur l'autre.
   */
  it("ne confond pas le même document dans deux cycles", async () => {
    await cacheDocument("plan-1", fileDocument());

    expect(localDocumentUri("plan-2", fileDocument())).toBeNull();
  });

  it("rend null pour un lien externe, qui n'a pas d'octets à garder", () => {
    expect(localDocumentUri("plan-1", fileDocument({ type: DocumentType.LINK }))).toBeNull();
  });
});

describe("cacheDocument", () => {
  it("crée le répertoire du cycle puis descend le fichier", async () => {
    await expect(cacheDocument("plan-1", fileDocument())).resolves.toBe(true);

    expect(directories.has(`${ROOT}/plan-1`)).toBe(true);
    expect(FakeFile.downloadFileAsync).toHaveBeenCalledTimes(1);
  });

  /**
   * Le cœur du dispositif : une passe de réconciliation repasse sur TOUS les documents des cycles
   * visibles à chaque ouverture. Sans ce court-circuit, chacune re-téléchargerait le cycle entier.
   */
  it("ne redescend pas un document déjà présent", async () => {
    await cacheDocument("plan-1", fileDocument());
    await expect(cacheDocument("plan-1", fileDocument())).resolves.toBe(true);

    expect(FakeFile.downloadFileAsync).toHaveBeenCalledTimes(1);
  });

  it("ne descend pas un lien externe", async () => {
    await expect(cacheDocument("plan-1", fileDocument({ type: DocumentType.LINK }))).resolves.toBe(
      false,
    );

    expect(FakeFile.downloadFileAsync).not.toHaveBeenCalled();
  });

  /**
   * URL signée périmée, disque plein, réseau coupé en route : l'échec est un `false`, jamais une
   * exception. Un document manquant dégrade la lecture, il ne fait pas tomber l'écran.
   */
  it("rend false sans lever quand le téléchargement échoue", async () => {
    FakeFile.downloadFileAsync.mockRejectedValueOnce(new Error("403"));

    await expect(cacheDocument("plan-1", fileDocument())).resolves.toBe(false);
    expect(localDocumentUri("plan-1", fileDocument())).toBeNull();
  });

  it("reprend l'extension du nom d'origine, et rien d'autre", async () => {
    await cacheDocument("plan-1", fileDocument({ id: "doc-2", fileName: "notes" }));
    await cacheDocument("plan-1", fileDocument({ id: "doc-3", fileName: null }));
    await cacheDocument("plan-1", fileDocument({ id: "doc-4", fileName: "a.tar.gz" }));

    expect(files.has(`${ROOT}/plan-1/doc-2`)).toBe(true);
    expect(files.has(`${ROOT}/plan-1/doc-3`)).toBe(true);
    expect(files.has(`${ROOT}/plan-1/doc-4.gz`)).toBe(true);
  });

  /**
   * `fileName` vient du coach et sert à composer un chemin : une extension qui n'en est pas une
   * est ignorée plutôt que recopiée.
   */
  it("ignore une extension qui n'en est pas une", async () => {
    await cacheDocument("plan-1", fileDocument({ id: "doc-5", fileName: "seance.v1/../etc" }));

    expect(files.has(`${ROOT}/plan-1/doc-5`)).toBe(true);
  });
});

describe("purgePlansExcept", () => {
  it("supprime les cycles absents de la liste et garde les autres", async () => {
    await cacheDocument("plan-1", fileDocument());
    await cacheDocument("plan-2", fileDocument());

    purgePlansExcept(["plan-1"]);

    expect(localDocumentUri("plan-1", fileDocument())).not.toBeNull();
    expect(localDocumentUri("plan-2", fileDocument())).toBeNull();
    expect(directories.has(`${ROOT}/plan-2`)).toBe(false);
  });

  /**
   * Une relation rompue ne laisse aucun cycle visible : la même opération vide tout, sans que la
   * rupture ait à être détectée pour elle-même.
   */
  it("vide tout quand plus aucun cycle n'est visible", async () => {
    await cacheDocument("plan-1", fileDocument());

    purgePlansExcept([]);

    expect(localDocumentUri("plan-1", fileDocument())).toBeNull();
  });

  it("ne lève pas quand le magasin n'existe pas encore", () => {
    expect(() => purgePlansExcept(["plan-1"])).not.toThrow();
  });
});

describe("purgeAllDocuments", () => {
  it("efface le magasin entier", async () => {
    await cacheDocument("plan-1", fileDocument());
    await cacheDocument("plan-2", fileDocument());

    purgeAllDocuments();

    expect(directories.has(ROOT)).toBe(false);
    expect(files.size).toBe(0);
  });

  it("ne lève pas quand il n'y a rien à effacer", () => {
    expect(() => purgeAllDocuments()).not.toThrow();
  });
});

describe("storeGeneration", () => {
  /**
   * L'époque est ce qui permet à une passe de téléchargement en vol de s'apercevoir que le compte
   * a changé sous elle. Sans elle, elle continuait d'écrire les séances du compte quitté dans le
   * cache du suivant.
   */
  it("change à chaque purge totale", () => {
    const before = storeGeneration();

    purgeAllDocuments();

    expect(storeGeneration()).not.toBe(before);
  });

  it("ne change pas pour une purge partielle, qui ne quitte aucun compte", async () => {
    await cacheDocument("plan-1", fileDocument());
    const before = storeGeneration();

    purgePlansExcept([]);

    expect(storeGeneration()).toBe(before);
  });
});

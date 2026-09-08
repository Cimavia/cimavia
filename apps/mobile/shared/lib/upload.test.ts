import { MULTIPART_STALL_TIMEOUT_MS } from "@cmv/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le transport mobile n'avait aucun test : sa boucle était prisonnière d'`expo-file-system`, et
 * elle en est sortie en #152. Ce qui reste ici — la lecture par plage, le chien de garde, et la
 * lecture de ce que le storage répond — porte les décisions les plus faciles à casser en silence.
 */

const CACHE = "file:///cache";
const opened: { offset: number | null; closed: boolean }[] = [];
const written: { name: string; bytes: number }[] = [];
const deleted: string[] = [];

// Le fichier tel qu'`expo-file-system` l'expose, réduit à ce que le transport en utilise.
class FakeFile {
  readonly uri: string;
  size = 0;

  constructor(base: string | { uri: string }, name?: string) {
    this.uri = typeof base === "string" ? base : `${base.uri}/${name}`;
    this.size = sizes.get(this.uri) ?? 0;
  }

  open() {
    const handle = { offset: null as number | null, closed: false, readBytes: (n: number) => n };
    opened.push(handle);
    return {
      set offset(value: number) {
        handle.offset = value;
      },
      readBytes: (length: number) => length,
      close: () => {
        handle.closed = true;
      },
    };
  }

  create() {
    /* le fichier de cache naît vide */
  }

  write(bytes: number) {
    written.push({ name: this.uri, bytes });
  }

  delete() {
    deleted.push(this.uri);
  }

  upload = (url: string, options: Record<string, unknown>) => uploadMock(url, options);
}

const sizes = new Map<string, number>();
const uploadMock = vi.fn();

vi.mock("expo-file-system", () => ({
  File: FakeFile,
  Paths: { cache: { uri: CACHE } },
  FileMode: { ReadOnly: "r" },
  UploadType: { BINARY_CONTENT: "binary" },
}));

const {
  sendStoragePart,
  StorageUploadError,
  storageFileSize,
  storagePartFailure,
  uploadFileToStorage,
} = await import("./upload");

const part = { partNumber: 3, url: "https://s3.test/p3", start: 20, length: 10 };

beforeEach(() => {
  vi.useFakeTimers();
  opened.length = 0;
  written.length = 0;
  deleted.length = 0;
  sizes.clear();
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ status: 200 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("storageFileSize", () => {
  it("rend la taille du fichier sur le disque", () => {
    sizes.set("file:///video.mp4", 4_096);
    expect(storageFileSize("file:///video.mp4")).toBe(4_096);
  });
});

describe("storagePartFailure", () => {
  it("rend ce que le storage a répondu", () => {
    const boom = new StorageUploadError("rejected", { kind: "status", status: 503 });
    expect(storagePartFailure(boom)).toEqual({ kind: "status", status: 503 });
  });

  // `null` = « je ne sais pas d'où ça vient », donc jamais réessayé.
  it("rend null sur une erreur qui ne vient pas du storage", () => {
    expect(storagePartFailure(new TypeError("bug applicatif"))).toBeNull();
  });
});

describe("sendStoragePart", () => {
  it("lit la PLAGE de la part et la pousse, sans charger le fichier entier", async () => {
    await sendStoragePart("file:///video.mp4", part, vi.fn());

    // L'offset est celui de la part, et on ne lit que sa longueur : c'est ce qui évite l'OOM
    // mesuré sur Android, où `slice()` matérialisait les 400 Mo du fichier.
    expect(opened[0]?.offset).toBe(20);
    expect(written[0]?.bytes).toBe(10);
    expect(uploadMock).toHaveBeenCalledWith(
      "https://s3.test/p3",
      expect.objectContaining({ httpMethod: "PUT" }),
    );
  });

  it("referme la poignée de lecture et efface le fichier de cache", async () => {
    await sendStoragePart("file:///video.mp4", part, vi.fn());

    expect(opened[0]?.closed).toBe(true);
    expect(deleted).toHaveLength(1);
  });

  // Un envoi de 40 parts abandonné en route laisserait sinon des centaines de Mo dans le cache.
  it("efface le fichier de cache MÊME quand l'envoi échoue", async () => {
    uploadMock.mockRejectedValue(new Error("réseau"));

    await expect(sendStoragePart("file:///video.mp4", part, vi.fn())).rejects.toBeInstanceOf(
      StorageUploadError,
    );
    expect(deleted).toHaveLength(1);
  });

  it("distingue un storage injoignable d'un storage qui refuse", async () => {
    uploadMock.mockRejectedValue(new Error("pas de route"));
    await expect(sendStoragePart("file:///v.mp4", part, vi.fn())).rejects.toMatchObject({
      reason: "unreachable",
      failure: { kind: "unreachable" },
    });

    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ status: 403 });
    await expect(sendStoragePart("file:///v.mp4", part, vi.fn())).rejects.toMatchObject({
      reason: "rejected",
      failure: { kind: "status", status: 403 },
    });
  });

  /**
   * MESURÉ sur appareil : au passage wifi → 5G, la requête ne casse pas, elle GÈLE. Sans ce chien
   * de garde, la promesse ne se règle jamais et aucun réessai ne peut partir.
   */
  it("coupe un envoi qui n'avance plus, et le dit comme un storage injoignable", async () => {
    uploadMock.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("AbortError")));
        }),
    );

    // L'assertion est ATTACHÉE avant d'avancer les minuteurs : sans elle, le rejet survient sans
    // gestionnaire et Node le compte comme une erreur non capturée, ce qui fait échouer le run.
    const sending = sendStoragePart("file:///v.mp4", part, vi.fn());
    const rejected = expect(sending).rejects.toMatchObject({ failure: { kind: "unreachable" } });
    await vi.advanceTimersByTimeAsync(MULTIPART_STALL_TIMEOUT_MS);

    await rejected;
  });

  // Le minuteur repart à chaque octet : un envoi lent mais VIVANT ne doit jamais être coupé.
  it("ne coupe pas un envoi lent tant qu'il progresse", async () => {
    uploadMock.mockImplementation(
      async (_url: string, options: { onProgress: (p: { bytesSent: number }) => void }) => {
        for (let sent = 1; sent <= 4; sent += 1) {
          await vi.advanceTimersByTimeAsync(MULTIPART_STALL_TIMEOUT_MS * 0.75);
          options.onProgress({ bytesSent: sent });
        }
        return { status: 200 };
      },
    );

    const sent: number[] = [];
    await expect(
      sendStoragePart("file:///v.mp4", part, (bytes) => sent.push(bytes)),
    ).resolves.toBeUndefined();
    expect(sent).toEqual([1, 2, 3, 4]);
  });
});

describe("uploadFileToStorage", () => {
  it("rapporte la progression en POURCENTAGE du fichier entier", async () => {
    sizes.set("file:///photo.jpg", 200);
    uploadMock.mockImplementation(
      async (_url: string, options: { onProgress: (p: { bytesSent: number }) => void }) => {
        options.onProgress({ bytesSent: 50 });
        return { status: 200 };
      },
    );

    const percents: number[] = [];
    // L'URL d'abord, le fichier ensuite — l'ordre inverse rendait un fichier de taille nulle.
    await uploadFileToStorage("https://s3.test/one", "file:///photo.jpg", "image/jpeg", (p) =>
      percents.push(p),
    );

    expect(percents).toEqual([25]);
  });
});

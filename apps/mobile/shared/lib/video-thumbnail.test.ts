import { createVideoPlayer } from "expo-video";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

/**
 * Un système de fichiers en mémoire, comme pour `document-cache` : le mock du harnais répond
 * toujours « le fichier existe », et ne prouverait rien de la présence, du déplacement ni de la purge.
 */
const CACHE = "file:///cache";
const ROOT = `${CACHE}/video-thumbnails`;

const files = new Set<string>();
const directories = new Set<string>();
// Un disque qui refuse toute lecture : carte retirée, permissions révoquées.
let brokenDisk = false;

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
    if (brokenDisk) throw new Error("disque illisible");
    return directories.has(this.uri);
  }
  create() {
    directories.add(this.uri);
  }
  delete() {
    directories.delete(this.uri);
    for (const uri of [...files]) {
      if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    }
  }
}

class FakeFile {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    if (brokenDisk) throw new Error("disque illisible");
    return files.has(this.uri);
  }
  move(target: FakeFile) {
    if (!files.has(this.uri)) throw new Error(`absent : ${this.uri}`);
    files.delete(this.uri);
    files.add(target.uri);
    this.uri = target.uri;
  }
  delete() {
    files.delete(this.uri);
  }
}

vi.mock("expo-file-system", () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { cache: { uri: CACHE } },
}));

// Chaque rendu écrit un JPEG temporaire, là où le vrai module le poserait.
let saved = 0;
const saveAsync = vi.fn(async () => {
  saved += 1;
  const uri = `${CACHE}/ImageManipulator/${saved}.jpg`;
  files.add(uri);
  return { uri, width: 480, height: 300 };
});
const manipulate = vi.fn((_source: unknown) => ({
  renderAsync: async () => ({ saveAsync }),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (source: unknown) => manipulate(source) },
  SaveFormat: { JPEG: "jpeg" },
}));

const { localVideoThumbnailUri, purgeVideoThumbnails, thumbnailTimeSeconds, videoThumbnail } =
  await import("./video-thumbnail");

const URL = "https://s3.test/voie.mp4?X-Amz-Date=120000";
const THUMBNAIL = { width: 480, height: 300 };

type FakePlayer = { generateThumbnailsAsync: Mock; release: Mock };

function fakePlayer(generate: () => Promise<unknown[]> = async () => [THUMBNAIL]): FakePlayer {
  return { generateThumbnailsAsync: vi.fn(generate), release: vi.fn() };
}

// Les lecteurs créés, dans l'ordre : `createVideoPlayer` est le `vi.fn` du harnais.
function players(): FakePlayer[] {
  return vi.mocked(createVideoPlayer).mock.results.map((result) => result.value as FakePlayer);
}

function givenPlayers(...next: FakePlayer[]) {
  const queue = [...next];
  vi.mocked(createVideoPlayer).mockImplementation(
    () => (queue.shift() ?? fakePlayer()) as unknown as ReturnType<typeof createVideoPlayer>,
  );
}

const resolveTo = (url: string | null) => vi.fn(async () => url);

beforeEach(() => {
  brokenDisk = false;
  files.clear();
  directories.clear();
  givenPlayers();
});

describe("thumbnailTimeSeconds", () => {
  it("tire l'image à une seconde, pour éviter la première, souvent noire", () => {
    expect(thumbnailTimeSeconds(42)).toBe(1);
  });

  it("prend le milieu d'une vidéo de moins de deux secondes", () => {
    expect(thumbnailTimeSeconds(1)).toBe(0.5);
    expect(thumbnailTimeSeconds(0)).toBe(0);
  });

  it("tente une seconde quand la durée n'a pas été mesurée", () => {
    expect(thumbnailTimeSeconds(null)).toBe(1);
  });
});

describe("localVideoThumbnailUri", () => {
  it("rend le fichier déjà tiré", () => {
    files.add(`${ROOT}/msg-1.jpg`);

    expect(localVideoThumbnailUri("msg-1")).toBe(`${ROOT}/msg-1.jpg`);
  });

  it("rend null quand rien n'est encore sur l'appareil", () => {
    expect(localVideoThumbnailUri("msg-1")).toBeNull();
  });

  // Un disque illisible fait perdre la vignette, jamais l'écran.
  it("rend null quand le disque est illisible", () => {
    brokenDisk = true;

    expect(localVideoThumbnailUri("msg-1")).toBeNull();
  });

  // L'identifiant compose un chemin : rien d'autre qu'un identifiant n'y entre.
  it("refuse un identifiant qui sortirait du répertoire", () => {
    files.add(`${CACHE}/secret.jpg`);

    expect(localVideoThumbnailUri("../secret")).toBeNull();
  });
});

describe("videoThumbnail", () => {
  it("tire l'image sur l'URL vérifiée, la range sous le média, et relâche le lecteur", async () => {
    const resolveUrl = resolveTo(URL);

    const uri = await videoThumbnail("msg-1", resolveUrl, 42);

    expect(uri).toBe(`${ROOT}/msg-1.jpg`);
    expect(files.has(`${ROOT}/msg-1.jpg`)).toBe(true);
    expect(createVideoPlayer).toHaveBeenCalledWith(URL);
    expect(players()[0]?.generateThumbnailsAsync).toHaveBeenCalledWith(1, { maxWidth: 480 });
    expect(manipulate).toHaveBeenCalledWith(THUMBNAIL);
    expect(saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.7 });
    expect(players()[0]?.release).toHaveBeenCalledTimes(1);
  });

  // La seconde vue lit le disque : ni réseau, ni lecteur natif.
  it("ne retire rien quand la vignette est déjà sur l'appareil", async () => {
    files.add(`${ROOT}/msg-1.jpg`);
    const resolveUrl = resolveTo(URL);

    expect(await videoThumbnail("msg-1", resolveUrl, 42)).toBe(`${ROOT}/msg-1.jpg`);
    expect(resolveUrl).not.toHaveBeenCalled();
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("rend null sans ouvrir de lecteur quand l'URL ne peut pas être re-signée", async () => {
    expect(await videoThumbnail("msg-1", resolveTo(null), 42)).toBeNull();
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("rend null quand le lecteur ne tire aucune image", async () => {
    givenPlayers(fakePlayer(async () => []));

    expect(await videoThumbnail("msg-1", resolveTo(URL), 42)).toBeNull();
    expect(players()[0]?.release).toHaveBeenCalledTimes(1);
  });

  /**
   * L'échec n'est pas retenu : hors réseau aujourd'hui, la vidéo aura sa vignette au prochain
   * affichage. Et le lecteur est relâché même quand le tirage lève.
   */
  it("relâche le lecteur sur un échec, et retente à l'appel suivant", async () => {
    givenPlayers(
      fakePlayer(async () => Promise.reject(new Error("décodage"))),
      fakePlayer(),
    );

    expect(await videoThumbnail("msg-1", resolveTo(URL), 42)).toBeNull();
    expect(players()[0]?.release).toHaveBeenCalledTimes(1);

    expect(await videoThumbnail("msg-1", resolveTo(URL), 42)).toBe(`${ROOT}/msg-1.jpg`);
  });

  it("refuse un identifiant qui sortirait du répertoire, sans rien tirer", async () => {
    expect(await videoThumbnail("../secret", resolveTo(URL), 42)).toBeNull();
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  // Un fil de vingt vidéos n'ouvre jamais vingt lecteurs natifs ensemble.
  it("tire une vidéo à la fois", async () => {
    let finishFirst: (value: unknown[]) => void = () => undefined;
    givenPlayers(
      fakePlayer(() => new Promise((resolve) => (finishFirst = resolve))),
      fakePlayer(),
    );

    const first = videoThumbnail("msg-1", resolveTo(URL), 42);
    const second = videoThumbnail("msg-2", resolveTo(URL), 42);
    await vi.waitFor(() => expect(createVideoPlayer).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createVideoPlayer).toHaveBeenCalledTimes(1);

    finishFirst([THUMBNAIL]);

    expect(await first).toBe(`${ROOT}/msg-1.jpg`);
    expect(await second).toBe(`${ROOT}/msg-2.jpg`);
    expect(createVideoPlayer).toHaveBeenCalledTimes(2);
  });

  // La même vidéo affichée deux fois (le fil, puis sous le débrief) n'est tirée qu'une.
  it("ne tire qu'une fois une vidéo demandée deux fois en même temps", async () => {
    const [first, second] = await Promise.all([
      videoThumbnail("msg-1", resolveTo(URL), 42),
      videoThumbnail("msg-1", resolveTo(URL), 42),
    ]);

    expect(first).toBe(`${ROOT}/msg-1.jpg`);
    expect(second).toBe(first);
    expect(createVideoPlayer).toHaveBeenCalledTimes(1);
  });

  /**
   * Déconnexion pendant le tirage : l'image appartient au compte QUITTÉ. Elle ne doit pas atterrir
   * dans le magasin qu'on vient de vider — ni traîner dans le cache sous un autre nom.
   */
  it("jette l'image d'une génération rattrapée par une purge", async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    givenPlayers(fakePlayer(() => new Promise((resolve) => (finish = resolve))));

    const pending = videoThumbnail("msg-1", resolveTo(URL), 42);
    await vi.waitFor(() => expect(createVideoPlayer).toHaveBeenCalledTimes(1));
    purgeVideoThumbnails();
    finish([THUMBNAIL]);

    expect(await pending).toBeNull();
    expect(files.size).toBe(0);
  });

  // Encore dans la file au moment de la purge : elle n'est même pas tirée.
  it("abandonne une demande encore en attente au moment d'une purge", async () => {
    let finishFirst: (value: unknown[]) => void = () => undefined;
    givenPlayers(fakePlayer(() => new Promise((resolve) => (finishFirst = resolve))));
    const resolveSecond = resolveTo(URL);

    const first = videoThumbnail("msg-1", resolveTo(URL), 42);
    const second = videoThumbnail("msg-2", resolveSecond, 42);
    await vi.waitFor(() => expect(createVideoPlayer).toHaveBeenCalledTimes(1));
    purgeVideoThumbnails();
    finishFirst([THUMBNAIL]);

    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(resolveSecond).not.toHaveBeenCalled();
    expect(createVideoPlayer).toHaveBeenCalledTimes(1);
  });

  // Après une purge, une nouvelle demande du même média repart de zéro, sans être confondue avec
  // celle qu'on vient d'abandonner.
  it("tire à nouveau un média demandé après une purge", async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    givenPlayers(
      fakePlayer(() => new Promise((resolve) => (finish = resolve))),
      fakePlayer(),
    );

    const abandoned = videoThumbnail("msg-1", resolveTo(URL), 42);
    await vi.waitFor(() => expect(createVideoPlayer).toHaveBeenCalledTimes(1));
    purgeVideoThumbnails();
    const fresh = videoThumbnail("msg-1", resolveTo(URL), 42);
    finish([THUMBNAIL]);

    expect(await abandoned).toBeNull();
    expect(await fresh).toBe(`${ROOT}/msg-1.jpg`);
  });
});

describe("purgeVideoThumbnails", () => {
  it("efface toutes les vignettes de l'appareil", () => {
    directories.add(ROOT);
    files.add(`${ROOT}/msg-1.jpg`);
    files.add(`${ROOT}/fm-2.jpg`);

    purgeVideoThumbnails();

    expect(files.size).toBe(0);
    expect(localVideoThumbnailUri("msg-1")).toBeNull();
  });

  it("ne fait rien, sans lever, quand il n'y a rien à effacer", () => {
    expect(() => purgeVideoThumbnails()).not.toThrow();
  });

  // Une déconnexion ne doit jamais échouer pour un cache d'images.
  it("ne lève pas quand le disque est illisible", () => {
    brokenDisk = true;

    expect(() => purgeVideoThumbnails()).not.toThrow();
  });
});

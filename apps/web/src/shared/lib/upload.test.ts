import { MULTIPART_STALL_TIMEOUT_MS } from "@cmv/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoragePutError, sendWebPart, uploadToSignedUrl, webPartFailure } from "./upload";

/**
 * Le transport web n'avait aucun test : sa boucle était prisonnière de XHR, et elle en est sortie
 * en #152. Ce qui reste ici — le découpage du `File`, le chien de garde, et la lecture du statut —
 * porte les décisions les plus faciles à casser en silence.
 */

// XHR réduit à ce que le transport en utilise, piloté à la main depuis les tests.
class FakeXhr {
  static last: FakeXhr | null = null;
  status = 200;
  method: string | null = null;
  url: string | null = null;
  body: Blob | null = null;
  readonly headers: Record<string, string> = {};
  readonly upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: Blob) {
    this.body = body;
  }

  abort() {
    this.onloadend?.();
    this.onabort?.();
  }

  // Ce que le réseau ferait, déclenché explicitement par le test.
  progress(loaded: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded } as ProgressEvent);
  }

  respond(status: number) {
    this.status = status;
    this.onloadend?.();
    this.onload?.();
  }

  fail() {
    this.onloadend?.();
    this.onerror?.();
  }
}

// Les octets sont RÉELLEMENT alloués : c'est `slice()` qu'on teste ici, et une taille seulement
// déclarée rendrait un blob vide. Cent octets, la mémoire n'est pas le sujet.
const file = (bytes: number, type = "video/mp4") =>
  new File([new Uint8Array(bytes)], "longue.mp4", { type });

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function xhr(): FakeXhr {
  if (FakeXhr.last == null) throw new Error("aucune requête ouverte");
  return FakeXhr.last;
}

describe("webPartFailure", () => {
  it("rend ce que le storage a répondu", () => {
    const boom = new StoragePutError({ kind: "status", status: 503 }, "indisponible");
    expect(webPartFailure(boom)).toEqual({ kind: "status", status: 503 });
  });

  // `null` = « je ne sais pas d'où ça vient », donc jamais réessayé.
  it("rend null sur une erreur qui ne vient pas du storage", () => {
    expect(webPartFailure(new TypeError("bug applicatif"))).toBeNull();
  });
});

describe("sendWebPart", () => {
  const part = { partNumber: 3, url: "https://s3.test/p3", start: 20, length: 10 };

  it("découpe la PLAGE de la part et la pousse sans Content-Type", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    // `UploadPartCommand` ne signe pas le type : en poser un ferait rejeter la signature.
    expect(xhr().headers["Content-Type"]).toBeUndefined();
    expect(xhr().url).toBe("https://s3.test/p3");
    expect(xhr().body?.size).toBe(10);

    xhr().respond(200);
    await expect(sending).resolves.toBeUndefined();
  });

  it("porte le statut du refus, et pas seulement une phrase", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    const rejected = expect(sending).rejects.toMatchObject({
      failure: { kind: "status", status: 403 },
    });
    xhr().respond(403);
    await rejected;
  });

  it("dit injoignable quand le réseau lâche", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    const rejected = expect(sending).rejects.toMatchObject({ failure: { kind: "unreachable" } });
    xhr().fail();
    await rejected;
  });

  it("cale la progression sur la taille réelle à la fin", async () => {
    const sent: number[] = [];
    const sending = sendWebPart(file(100), part, (bytes) => sent.push(bytes));
    xhr().progress(4);
    xhr().respond(200);
    await sending;

    // `onprogress` peut s'arrêter avant le dernier octet : sans ce calage, une barre resterait
    // bloquée à 98 % sur un envoi pourtant terminé.
    expect(sent).toEqual([4, 10]);
  });

  /**
   * Une requête peut GELER sur un lien mort au lieu d'échouer (mesuré sur mobile au passage
   * wifi → 5G). Sans ce chien de garde, rien ne rejette et le réessai attend une erreur qui ne
   * viendra jamais.
   */
  it("coupe un envoi qui n'avance plus, et le dit comme un storage injoignable", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    const rejected = expect(sending).rejects.toMatchObject({ failure: { kind: "unreachable" } });
    await vi.advanceTimersByTimeAsync(MULTIPART_STALL_TIMEOUT_MS);
    await rejected;
  });

  // Le minuteur repart à chaque octet : un envoi lent mais VIVANT ne doit jamais être coupé.
  it("ne coupe pas un envoi lent tant qu'il progresse", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    for (let sent = 1; sent <= 4; sent += 1) {
      await vi.advanceTimersByTimeAsync(MULTIPART_STALL_TIMEOUT_MS * 0.75);
      xhr().progress(sent);
    }
    xhr().respond(200);

    await expect(sending).resolves.toBeUndefined();
  });

  /**
   * Une annulation n'est PAS un accroc : c'est une décision. Elle sort sans `PartFailure`, ce qui
   * la rend non réessayable par construction.
   */
  it("laisse une annulation délibérée hors du réessai", async () => {
    const sending = sendWebPart(file(100), part, vi.fn());
    const rejected = expect(sending).rejects.toThrow(/annulé/);
    xhr().onloadend?.();
    xhr().onabort?.();
    await rejected;
  });
});

describe("uploadToSignedUrl", () => {
  it("envoie le fichier entier avec le type signé, en pourcentage", async () => {
    const percents: number[] = [];
    const sending = uploadToSignedUrl("https://s3.test/one", file(200), (p) => percents.push(p));

    // Doit correspondre au Content-Type signé par l'API, sinon la signature est rejetée.
    expect(xhr().headers["Content-Type"]).toBe("video/mp4");
    xhr().progress(50);
    xhr().respond(200);
    await sending;

    expect(percents).toEqual([25, 100]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { type MultipartUploadTicket, UploadMode } from "../dto/upload.schema";
import {
  isRetryablePartFailure,
  MULTIPART_PART_MAX_ATTEMPTS,
  type MultipartPart,
  type MultipartUploadRunner,
  multipartPartsOf,
  multipartRetryDelayMs,
  runMultipartUpload,
  uploadPercentOf,
} from "./multipart-upload.util";

const PART_SIZE = 10;

function ticketOf(partCount: number, partSize = PART_SIZE): MultipartUploadTicket {
  return {
    mode: UploadMode.MULTIPART,
    storagePath: "athlete/a-1/feedback/s-1/video.mp4",
    expiresIn: 3600,
    uploadId: "upload-1",
    partSize,
    partUrls: Array.from({ length: partCount }, (_, index) => `https://s3.test/part-${index + 1}`),
  };
}

// Le storage tel que la boucle le voit : ce qu'il a reçu, et ce qu'il refuse encore.
function fakeRunner(overrides: Partial<MultipartUploadRunner> = {}) {
  const sent: number[] = [];
  const percents: number[] = [];
  const waited: number[] = [];
  const base: MultipartUploadRunner = {
    sendPart: async (part: MultipartPart) => {
      sent.push(part.partNumber);
    },
    failureOf: (error) => (error instanceof FakeFailure ? error.failure : null),
    complete: async () => undefined,
    abort: async () => undefined,
    onProgress: (percent) => percents.push(percent),
    wait: async (delayMs) => {
      waited.push(delayMs);
    },
  };
  const merged = { ...base, ...overrides };
  // Espionnées APRÈS la fusion : une surcharge passée telle quelle n'en serait pas une, et les
  // décomptes de tentatives porteraient sur un espion que plus personne n'appelle.
  const runner: MultipartUploadRunner = {
    ...merged,
    sendPart: vi.fn(merged.sendPart),
    complete: vi.fn(merged.complete),
    abort: vi.fn(merged.abort),
  };
  return { runner, sent, percents, waited };
}

class FakeFailure extends Error {
  constructor(readonly failure: { kind: "unreachable" } | { kind: "status"; status: number }) {
    super("échec simulé");
  }
}

const unreachable = () => new FakeFailure({ kind: "unreachable" });
const refused = (status: number) => new FakeFailure({ kind: "status", status });

describe("isRetryablePartFailure", () => {
  it("réessaie une coupure réseau", () => {
    expect(isRetryablePartFailure({ kind: "unreachable" })).toBe(true);
  });

  it.each([408, 429, 500, 502, 503, 504])("réessaie un %i, que le storage dit temporaire", (s) => {
    expect(isRetryablePartFailure({ kind: "status", status: s })).toBe(true);
  });

  // Une part refusée pour ce qu'elle EST le sera trois fois de suite : renvoyer dix mégaoctets
  // pour se faire redire non n'aide personne.
  it.each([400, 403, 404, 409])("ne réessaie pas un %i, qui refuse la part elle-même", (s) => {
    expect(isRetryablePartFailure({ kind: "status", status: s })).toBe(false);
  });
});

describe("multipartRetryDelayMs", () => {
  it("attend de plus en plus longtemps entre les tentatives", () => {
    expect(multipartRetryDelayMs(1)).toBe(1_000);
    expect(multipartRetryDelayMs(2)).toBe(3_000);
  });

  // `null` et non `0` : « plus de tentative » n'est pas « réessayer tout de suite ».
  it("rend null quand il ne reste aucune tentative", () => {
    expect(multipartRetryDelayMs(MULTIPART_PART_MAX_ATTEMPTS)).toBeNull();
    expect(multipartRetryDelayMs(99)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])("rend null sur un rang de tentative absurde (%p)", (a) => {
    expect(multipartRetryDelayMs(a)).toBeNull();
  });
});

describe("multipartPartsOf", () => {
  it("découpe le fichier en plages contiguës, la dernière tronquée", () => {
    expect(multipartPartsOf(ticketOf(3), 25)).toEqual([
      { partNumber: 1, url: "https://s3.test/part-1", start: 0, length: 10 },
      { partNumber: 2, url: "https://s3.test/part-2", start: 10, length: 10 },
      { partNumber: 3, url: "https://s3.test/part-3", start: 20, length: 5 },
    ]);
  });

  it("rend une dernière part pleine quand la taille tombe juste", () => {
    const parts = multipartPartsOf(ticketOf(2), 20);
    expect(parts?.at(-1)).toEqual({
      partNumber: 2,
      url: "https://s3.test/part-2",
      start: 10,
      length: 10,
    });
  });

  // Le ticket a été signé pour un autre poids : chaque part se ferait refuser sur son
  // `ContentLength`. Autant s'en apercevoir avant d'avoir poussé quoi que ce soit.
  it("rend null quand le ticket ne parle pas du même fichier", () => {
    expect(multipartPartsOf(ticketOf(3), 45)).toBeNull();
    expect(multipartPartsOf(ticketOf(3), 5)).toBeNull();
  });

  it.each([0, -1, 12.5, Number.NaN])("rend null sur une taille inexploitable (%p)", (size) => {
    expect(multipartPartsOf(ticketOf(3), size)).toBeNull();
  });

  it("suit le partSize du TICKET, pas la constante du protocole", () => {
    const parts = multipartPartsOf(ticketOf(2, 4), 7);
    expect(parts?.map((p) => p.length)).toEqual([4, 3]);
  });
});

describe("uploadPercentOf", () => {
  it("arrondit et borne à 100", () => {
    expect(uploadPercentOf(0, 200)).toBe(0);
    expect(uploadPercentOf(50, 200)).toBe(25);
    expect(uploadPercentOf(999, 200)).toBe(100);
  });

  it("rend 100 sur un total nul plutôt que NaN", () => {
    expect(uploadPercentOf(0, 0)).toBe(100);
  });
});

describe("runMultipartUpload", () => {
  it("envoie les parts dans l'ordre puis clôt avec leur décompte", async () => {
    const { runner, sent } = fakeRunner();

    await runMultipartUpload(ticketOf(3), 25, runner);

    expect(sent).toEqual([1, 2, 3]);
    expect(runner.complete).toHaveBeenCalledWith(3);
    expect(runner.abort).not.toHaveBeenCalled();
  });

  // Le cœur de #152 : la part 3 tombe, l'upload reste ouvert, les deux premières sont gardées.
  it("réessaie la part interrompue au lieu de jeter les précédentes", async () => {
    let attempts = 0;
    const { runner, sent, waited } = fakeRunner({
      sendPart: async (part) => {
        if (part.partNumber === 3) {
          attempts += 1;
          if (attempts === 1) throw unreachable();
        }
        sent.push(part.partNumber);
      },
    });

    await runMultipartUpload(ticketOf(3), 25, runner);

    expect(sent).toEqual([1, 2, 3]);
    expect(waited).toEqual([1_000]);
    expect(runner.complete).toHaveBeenCalledWith(3);
    expect(runner.abort).not.toHaveBeenCalled();
  });

  it("épuise ses tentatives puis abandonne, en relançant l'erreur d'origine", async () => {
    const boom = unreachable();
    const { runner, waited } = fakeRunner({
      sendPart: async () => {
        throw boom;
      },
    });

    await expect(runMultipartUpload(ticketOf(2), 15, runner)).rejects.toBe(boom);
    expect(runner.sendPart).toHaveBeenCalledTimes(MULTIPART_PART_MAX_ATTEMPTS);
    expect(waited).toEqual([1_000, 3_000]);
    expect(runner.abort).toHaveBeenCalledTimes(1);
    expect(runner.complete).not.toHaveBeenCalled();
  });

  it("n'insiste pas sur un refus que le réessai ne corrigerait pas", async () => {
    const boom = refused(403);
    const { runner, waited } = fakeRunner({
      sendPart: async () => {
        throw boom;
      },
    });

    await expect(runMultipartUpload(ticketOf(2), 15, runner)).rejects.toBe(boom);
    expect(runner.sendPart).toHaveBeenCalledTimes(1);
    expect(waited).toEqual([]);
    expect(runner.abort).toHaveBeenCalledTimes(1);
  });

  // Une erreur que le transport ne reconnaît pas est un bug applicatif, pas un réseau qui vacille.
  it("ne réessaie pas une erreur dont la provenance est inconnue", async () => {
    const bug = new TypeError("undefined is not a function");
    const { runner } = fakeRunner({
      sendPart: async () => {
        throw bug;
      },
    });

    await expect(runMultipartUpload(ticketOf(2), 15, runner)).rejects.toBe(bug);
    expect(runner.sendPart).toHaveBeenCalledTimes(1);
  });

  it("abandonne aussi quand c'est la clôture qui échoue", async () => {
    const boom = new Error("409 upload incomplet");
    const { runner } = fakeRunner({
      complete: async () => {
        throw boom;
      },
    });

    await expect(runMultipartUpload(ticketOf(2), 15, runner)).rejects.toBe(boom);
    expect(runner.abort).toHaveBeenCalledTimes(1);
  });

  // L'échec de l'abandon ne doit pas masquer l'erreur d'origine, la seule sur laquelle
  // l'utilisateur peut agir.
  it("laisse passer l'erreur d'origine même si l'abandon échoue à son tour", async () => {
    const boom = refused(400);
    const { runner } = fakeRunner({
      sendPart: async () => {
        throw boom;
      },
      abort: async () => {
        throw new Error("le storage ne répond plus non plus");
      },
    });

    await expect(runMultipartUpload(ticketOf(2), 15, runner)).rejects.toBe(boom);
  });

  it("refuse un ticket qui ne correspond pas au fichier, sans laisser l'upload ouvert", async () => {
    const { runner } = fakeRunner();

    await expect(runMultipartUpload(ticketOf(3), 99, runner)).rejects.toThrow(/ne correspond pas/);
    expect(runner.sendPart).not.toHaveBeenCalled();
    expect(runner.abort).toHaveBeenCalledTimes(1);
  });

  // Le minuteur par défaut, que tous les autres cas court-circuitent pour ne pas attendre.
  it("temporise avec son propre minuteur quand aucun ne lui est injecté", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const runner: MultipartUploadRunner = {
        sendPart: async () => {
          attempts += 1;
          if (attempts === 1) throw unreachable();
        },
        failureOf: (error) => (error instanceof FakeFailure ? error.failure : null),
        complete: async () => undefined,
        abort: async () => undefined,
        onProgress: null,
      };

      const done = runMultipartUpload(ticketOf(1), 10, runner);
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(done).resolves.toBeUndefined();
      expect(attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("progression", () => {
    it("rapporte l'avancement sur le total du fichier, pas sur la part", async () => {
      const { runner, percents } = fakeRunner({
        sendPart: async (part, onSentBytes) => {
          onSentBytes(part.length / 2);
        },
      });

      await runMultipartUpload(ticketOf(2), 20, runner);

      // 25 % = la moitié de la 1re part sur 20 octets ; 100 % = les deux parts calées à leur fin.
      expect(percents).toEqual([25, 50, 75, 100]);
    });

    // Un réessai renvoie la part depuis son premier octet : rapportée telle quelle, la barre
    // reculerait de dix mégaoctets à chaque accroc.
    it("ne recule jamais quand une part repart de zéro", async () => {
      let attempts = 0;
      const { runner, percents } = fakeRunner({
        sendPart: async (part, onSentBytes) => {
          if (part.partNumber === 2) {
            attempts += 1;
            onSentBytes(part.length * 0.9);
            if (attempts === 1) throw unreachable();
          }
          onSentBytes(part.length);
        },
      });

      await runMultipartUpload(ticketOf(2), 20, runner);

      expect(percents).toEqual([...percents].sort((a, b) => a - b));
      expect(percents.at(-1)).toBe(100);
    });

    it("se passe de barre là où l'écran n'en affiche pas", async () => {
      const { runner } = fakeRunner({ onProgress: null });

      await expect(runMultipartUpload(ticketOf(2), 15, runner)).resolves.toBeUndefined();
    });
  });
});

import { MediaType } from "@cmv/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import {
  MediaRejectedError,
  pickRecorderMimeType,
  prepareAudioBlob,
  prepareImageFile,
  prepareVideoFile,
  prepareWebMedia,
} from "./media.util";

const fileOf = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

/**
 * jsdom ne décode aucun média : un vrai `<video>` n'émettrait jamais `loadedmetadata`, et le test
 * pendrait jusqu'au timeout. On substitue donc l'élément que `readVideoDuration` fabrique — c'est
 * la seule façon d'atteindre les deux branches qui comptent (durée lue, fichier illisible).
 */
class FakeVideo {
  preload = "";
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly duration: number,
    private readonly unreadable: boolean,
  ) {}
  set src(_value: string) {
    queueMicrotask(() => (this.unreadable ? this.onerror?.() : this.onloadedmetadata?.()));
  }
}

function stubVideoElement(duration: number, unreadable = false) {
  const real = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "video"
      ? (new FakeVideo(duration, unreadable) as unknown as HTMLElement)
      : real(tag)) as typeof document.createElement);
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pickRecorderMimeType", () => {
  const supporting = (...mimes: string[]) =>
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (mime: string) => mimes.includes(mime) });

  /**
   * `audio/mp4` d'abord (#82) : c'est le seul format lisible partout, iOS compris. Chrome et
   * Firefox préfèrent `audio/webm`, et le laisser gagner rendrait la note inaudible pour un
   * athlète sur iPhone.
   */
  it("préfère audio/mp4 même quand le navigateur propose aussi du webm", () => {
    supporting("audio/webm", "audio/mp4");
    expect(pickRecorderMimeType(MESSAGE_MEDIA_PROFILE.audioMimeTypes)).toBe("audio/mp4");
  });

  it("retombe sur le premier format admis quand mp4 manque", () => {
    supporting("audio/webm");
    expect(pickRecorderMimeType(MESSAGE_MEDIA_PROFILE.audioMimeTypes)).toBe("audio/webm");
  });

  /**
   * `null` n'est pas une panne à rattraper : c'est ce qui doit éteindre le bouton AVANT qu'on
   * enregistre trente secondes pour un 400. Le débrief refuse le webm, donc un navigateur qui ne
   * sait produire que ça n'a rien à proposer.
   */
  it("rend null quand aucun format produit n'est admis par la feature", () => {
    supporting("audio/webm");
    expect(pickRecorderMimeType(FEEDBACK_MEDIA_PROFILE.audioMimeTypes)).toBeNull();
  });

  /**
   * Le navigateur qui n'a PAS l'API. Les trois cas ci-dessus la posent tous par `supporting()`,
   * si bien qu'aucun ne traversait la ligne qui la lit — l'absence d'`isAvailable` s'y voyait
   * comme un succès. C'est le rendu de l'écran de débrief en jsdom qui a fait sortir le
   * `ReferenceError`.
   */
  it("rend null sans lever quand le navigateur n'a pas MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(() => pickRecorderMimeType(FEEDBACK_MEDIA_PROFILE.audioMimeTypes)).not.toThrow();
    expect(pickRecorderMimeType(FEEDBACK_MEDIA_PROFILE.audioMimeTypes)).toBeNull();
  });
});

describe("prepareImageFile", () => {
  it("accepte une image admise et reporte nom, mime et taille", () => {
    const prepared = prepareImageFile(fileOf("prise.png", "image/png", 12), FEEDBACK_MEDIA_PROFILE);
    expect(prepared).toMatchObject({
      type: MediaType.IMAGE,
      fileName: "prise.png",
      mimeType: "image/png",
      size: 12,
    });
  });

  it("refuse un format non géré avec la clé i18n de la feature", () => {
    expect(() => prepareImageFile(fileOf("a.gif", "image/gif", 1), FEEDBACK_MEDIA_PROFILE)).toThrow(
      new MediaRejectedError(FEEDBACK_MEDIA_PROFILE.keys.imageFormat),
    );
  });

  /**
   * Le plafond est INTERPOLÉ dans le message, jamais réécrit en dur : c'est ce qui empêche le
   * refus de mentir le jour où la constante bouge — `check:i18n` vérifie l'existence d'une clé,
   * pas la véracité de son contenu.
   */
  it("refuse un fichier trop lourd en citant le plafond réel, en mégaoctets", () => {
    const oneMegabyte = 1024 * 1024;
    const profile = { ...FEEDBACK_MEDIA_PROFILE, imageMaxBytes: oneMegabyte };
    try {
      prepareImageFile(fileOf("a.png", "image/png", oneMegabyte + 1), profile);
      expect.unreachable("le fichier dépasse le plafond");
    } catch (error) {
      expect(error).toBeInstanceOf(MediaRejectedError);
      expect((error as MediaRejectedError).params).toEqual({ max: 1 });
    }
  });
});

describe("prepareVideoFile", () => {
  it("lit la durée et la reporte, arrondie à la seconde supérieure", async () => {
    stubVideoElement(12.2);
    await expect(
      prepareVideoFile(fileOf("v.mp4", "video/mp4", 4), FEEDBACK_MEDIA_PROFILE),
    ).resolves.toMatchObject({ type: MediaType.VIDEO, durationSeconds: 13 });
  });

  it("refuse une vidéo trop longue une fois la durée connue", async () => {
    stubVideoElement(FEEDBACK_MEDIA_PROFILE.videoMaxDurationSeconds + 1);
    await expect(
      prepareVideoFile(fileOf("v.mp4", "video/mp4", 4), FEEDBACK_MEDIA_PROFILE),
    ).rejects.toThrow(FEEDBACK_MEDIA_PROFILE.keys.videoTooLong);
  });

  it("refuse un fichier illisible plutôt que de laisser la promesse pendre", async () => {
    stubVideoElement(0, true);
    await expect(
      prepareVideoFile(fileOf("v.mp4", "video/mp4", 4), FEEDBACK_MEDIA_PROFILE),
    ).rejects.toThrow(FEEDBACK_MEDIA_PROFILE.keys.unreadable);
  });

  // Format et poids sont jugés AVANT de créer l'élément : on ne décode pas un fichier déjà refusé.
  it("refuse un format non géré sans même tenter de lire la durée", async () => {
    const create = vi.spyOn(document, "createElement");
    await expect(
      prepareVideoFile(fileOf("v.avi", "video/x-msvideo", 4), FEEDBACK_MEDIA_PROFILE),
    ).rejects.toThrow(FEEDBACK_MEDIA_PROFILE.keys.videoFormat);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse un fichier trop lourd en citant le plafond", async () => {
    const profile = { ...FEEDBACK_MEDIA_PROFILE, videoMaxBytes: 3 };
    await expect(prepareVideoFile(fileOf("v.mp4", "video/mp4", 4), profile)).rejects.toThrow(
      profile.keys.videoTooBig,
    );
  });
});

describe("prepareAudioBlob", () => {
  const blobOf = (type: string, bytes = 8) => new Blob([new Uint8Array(bytes)], { type });

  /**
   * `MediaRecorder` rend un type qui porte le codec. Seul le type de base doit survivre : c'est
   * lui qui est signé ET envoyé en Content-Type, et une divergence fait rejeter la signature.
   */
  it("laisse tomber le codec accolé au mime", () => {
    const prepared = prepareAudioBlob(blobOf("audio/mp4;codecs=opus"), 5, FEEDBACK_MEDIA_PROFILE);
    expect(prepared.mimeType).toBe("audio/mp4");
  });

  it("nomme le fichier avec l'extension du format retenu", () => {
    expect(prepareAudioBlob(blobOf("audio/mp4"), 5, FEEDBACK_MEDIA_PROFILE).fileName).toMatch(
      /\.m4a$/,
    );
    expect(prepareAudioBlob(blobOf("audio/webm"), 5, MESSAGE_MEDIA_PROFILE).fileName).toMatch(
      /\.webm$/,
    );
  });

  // La divergence documentée entre les deux profils : le débrief n'accepte pas le webm.
  it("refuse pour un débrief le webm que la messagerie accepte", () => {
    expect(() => prepareAudioBlob(blobOf("audio/webm"), 5, FEEDBACK_MEDIA_PROFILE)).toThrow(
      FEEDBACK_MEDIA_PROFILE.keys.audioFormat,
    );
    expect(prepareAudioBlob(blobOf("audio/webm"), 5, MESSAGE_MEDIA_PROFILE).type).toBe(
      MediaType.AUDIO,
    );
  });

  it("refuse une note trop longue en citant le plafond en MINUTES", () => {
    try {
      prepareAudioBlob(blobOf("audio/mp4"), 100_000, FEEDBACK_MEDIA_PROFILE);
      expect.unreachable("la note dépasse la durée maximale");
    } catch (error) {
      expect((error as MediaRejectedError).params).toEqual({ max: 5 });
    }
  });

  it("refuse une note trop lourde", () => {
    const profile = { ...FEEDBACK_MEDIA_PROFILE, audioMaxBytes: 2 };
    expect(() => prepareAudioBlob(blobOf("audio/mp4", 8), 5, profile)).toThrow(
      profile.keys.audioTooBig,
    );
  });
});

describe("prepareWebMedia", () => {
  it("aiguille une note vocale vers la préparation audio", () => {
    const source = {
      kind: "audio" as const,
      blob: new Blob([new Uint8Array(4)], { type: "audio/mp4" }),
      durationSeconds: 3,
    };
    expect(prepareWebMedia(source, FEEDBACK_MEDIA_PROFILE)).toMatchObject({
      type: MediaType.AUDIO,
    });
  });

  it("aiguille un fichier selon son type", async () => {
    stubVideoElement(4);
    expect(
      prepareWebMedia(
        { kind: "file", file: fileOf("a.png", "image/png", 2) },
        FEEDBACK_MEDIA_PROFILE,
      ),
    ).toMatchObject({ type: MediaType.IMAGE });
    await expect(
      prepareWebMedia(
        { kind: "file", file: fileOf("v.mp4", "video/mp4", 2) },
        FEEDBACK_MEDIA_PROFILE,
      ),
    ).resolves.toMatchObject({ type: MediaType.VIDEO });
  });

  it("refuse ce qui n'est ni image, ni vidéo, ni note vocale", () => {
    expect(() =>
      prepareWebMedia(
        { kind: "file", file: fileOf("a.pdf", "application/pdf", 2) },
        FEEDBACK_MEDIA_PROFILE,
      ),
    ).toThrow(FEEDBACK_MEDIA_PROFILE.keys.unsupported);
  });
});

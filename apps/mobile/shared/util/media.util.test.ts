import { ApiError, MediaType } from "@cmv/shared";
import type { ImagePickerAsset } from "expo-image-picker";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import { MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import { MediaRejectedError, mediaErrorMessage, prepareAudio, prepareMedia } from "./media.util";

/**
 * Les deux modules natifs sont déjà coupés par `test/native.tsx`, mais avec des valeurs FIXES
 * (`size = 0`, `manipulate` qui ne rend rien). Ici on les redéclare pour pouvoir les PILOTER : la
 * taille mesurée est précisément ce que ce module décide d'accepter ou de refuser.
 */
const { fileSizes, resize, saveAsync } = vi.hoisted(() => ({
  fileSizes: new Map<string, number | null>(),
  resize: vi.fn(),
  saveAsync: vi.fn(),
}));

vi.mock("expo-file-system", () => ({
  File: class {
    size: number | null;
    constructor(readonly uri: string) {
      this.size = fileSizes.has(uri) ? (fileSizes.get(uri) ?? null) : 0;
    }
  },
}));

vi.mock("expo-image-manipulator", () => ({
  // La chaîne est fluide : `manipulate().resize()` rend le contexte, qu'on rend `renderAsync`.
  ImageManipulator: {
    manipulate: vi.fn(() => {
      const context = { resize };
      resize.mockReturnValue({ renderAsync: async () => ({ saveAsync }) });
      return context;
    }),
  },
  SaveFormat: { JPEG: "jpeg" },
}));

const COMPRESSED_URI = "file:///cache/compressed.jpg";

/**
 * `Partial` ne suffit pas sous `exactOptionalPropertyTypes` : plusieurs cas d'ici valent justement
 * de poser `undefined` EXPLICITEMENT — un asset sans nom, sans mime, sans durée — et c'est ce que
 * `Partial` refuse.
 */
type AssetOverride = { [K in keyof ImagePickerAsset]?: ImagePickerAsset[K] | undefined };

const photo = (over: AssetOverride = {}) =>
  ({
    type: "image",
    uri: "file:///dcim/source.heic",
    width: 4032,
    height: 3024,
    fileName: "voie-rouge-8a.heic",
    ...over,
  }) as ImagePickerAsset;

const video = (over: AssetOverride = {}) =>
  ({
    type: "video",
    uri: "file:///dcim/clip.mp4",
    mimeType: "video/mp4",
    duration: 12_000,
    fileName: "clip.mp4",
    width: 1920,
    height: 1080,
    ...over,
  }) as ImagePickerAsset;

/** Le refus attendu, lu sur la clé ET sur ses paramètres : c'est la phrase entière qui compte. */
async function rejection(run: () => unknown): Promise<MediaRejectedError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof MediaRejectedError) return error;
    throw error;
  }
  throw new Error("aucun refus levé");
}

beforeEach(() => {
  fileSizes.clear();
  saveAsync.mockResolvedValue({ uri: COMPRESSED_URI });
});

describe("prepareMedia — photo", () => {
  it("compresse en jpeg, garde le nom source et mesure la taille du fichier FINAL", async () => {
    fileSizes.set(COMPRESSED_URI, 400_000);

    const media = await prepareMedia(photo(), FEEDBACK_MEDIA_PROFILE);

    expect(media).toEqual({
      type: MediaType.IMAGE,
      uri: COMPRESSED_URI,
      fileName: "voie-rouge-8a.jpg",
      mimeType: "image/jpeg",
      size: 400_000,
    });
  });

  /**
   * Le nom source est ce que le coach LIT dans la galerie web du débrief. Un horodatage ne lui
   * dirait rien ; il n'a donc sa place que là où il n'y a pas de nom du tout.
   */
  it("horodate seulement quand l'asset n'a pas de nom, ou n'en a qu'une extension", async () => {
    const capture = await prepareMedia(photo({ fileName: undefined }), FEEDBACK_MEDIA_PROFILE);
    expect(capture.fileName).toMatch(/^photo-\d+\.jpg$/);

    const stripped = await prepareMedia(photo({ fileName: ".jpg" }), FEEDBACK_MEDIA_PROFILE);
    expect(stripped.fileName).toMatch(/^photo-\d+\.jpg$/);
  });

  /**
   * UNE seule dimension est contrainte, celle du plus grand côté : `expo-image-manipulator` garde
   * le ratio, et borner les deux déformerait la photo.
   */
  it("borne la largeur d'un paysage et la hauteur d'un portrait", async () => {
    await prepareMedia(photo({ width: 4032, height: 3024 }), FEEDBACK_MEDIA_PROFILE);
    expect(resize).toHaveBeenLastCalledWith({ width: 1600 });

    await prepareMedia(photo({ width: 3024, height: 4032 }), FEEDBACK_MEDIA_PROFILE);
    expect(resize).toHaveBeenLastCalledWith({ height: 1600 });
  });

  it("refuse une photo encore trop lourde APRÈS compression, en citant le plafond", async () => {
    fileSizes.set(COMPRESSED_URI, 200 * 1024 * 1024);

    const error = await rejection(() => prepareMedia(photo(), FEEDBACK_MEDIA_PROFILE));

    expect(error.reasonKey).toBe("feedback.media.imageTooBig");
    expect(error.params).toEqual({ max: 100 });
  });

  it("refuse un fichier dont la taille est illisible plutôt que d'en inventer une", async () => {
    fileSizes.set(COMPRESSED_URI, null);

    const error = await rejection(() => prepareMedia(photo(), FEEDBACK_MEDIA_PROFILE));

    expect(error.reasonKey).toBe("feedback.media.unreadable");
  });
});

describe("prepareMedia — vidéo", () => {
  it("passe la vidéo telle quelle, sans transcodage, durée arrondie à la seconde", async () => {
    fileSizes.set("file:///dcim/clip.mp4", 30_000_000);

    const media = await prepareMedia(video({ duration: 11_400 }), MESSAGE_MEDIA_PROFILE);

    expect(media).toEqual({
      type: MediaType.VIDEO,
      uri: "file:///dcim/clip.mp4",
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      size: 30_000_000,
      durationSeconds: 12,
    });
  });

  it("horodate une vidéo sans nom", async () => {
    const media = await prepareMedia(video({ fileName: undefined }), MESSAGE_MEDIA_PROFILE);
    expect(media.fileName).toMatch(/^video-\d+\.mp4$/);
  });

  it("refuse un format que le schéma n'accepte pas, et l'absence de format", async () => {
    const unknown = await rejection(() =>
      prepareMedia(video({ mimeType: "video/x-matroska" }), MESSAGE_MEDIA_PROFILE),
    );
    expect(unknown.reasonKey).toBe("messages.media.videoFormat");

    const absent = await rejection(() =>
      prepareMedia(video({ mimeType: undefined }), MESSAGE_MEDIA_PROFILE),
    );
    expect(absent.reasonKey).toBe("messages.media.videoFormat");
  });

  it("refuse une vidéo dont le picker ne donne pas la durée", async () => {
    const error = await rejection(() =>
      prepareMedia(video({ duration: undefined }), MESSAGE_MEDIA_PROFILE),
    );
    expect(error.reasonKey).toBe("messages.media.unreadable");
  });

  it("refuse une vidéo trop longue en citant le plafond en SECONDES", async () => {
    const error = await rejection(() =>
      prepareMedia(video({ duration: 240_000 }), MESSAGE_MEDIA_PROFILE),
    );

    expect(error.reasonKey).toBe("messages.media.videoTooLong");
    expect(error.params).toEqual({ max: 180 });
  });

  it("refuse une vidéo trop lourde en citant le plafond en MÉGAOCTETS", async () => {
    fileSizes.set("file:///dcim/clip.mp4", 2000 * 1024 * 1024);

    const error = await rejection(() => prepareMedia(video(), MESSAGE_MEDIA_PROFILE));

    expect(error.reasonKey).toBe("messages.media.videoTooBig");
    expect(error.params).toEqual({ max: 1000 });
  });

  /**
   * La durée est connue de l'asset ; la taille demande une lecture disque. Contrôler la durée
   * d'abord évite d'ouvrir le fichier d'une vidéo qu'on refusera de toute façon.
   */
  it("ne mesure même pas le fichier d'une vidéo déjà trop longue", async () => {
    fileSizes.set("file:///dcim/clip.mp4", 2000 * 1024 * 1024);

    const error = await rejection(() =>
      prepareMedia(video({ duration: 240_000 }), MESSAGE_MEDIA_PROFILE),
    );

    expect(error.reasonKey).toBe("messages.media.videoTooLong");
  });
});

describe("prepareAudio", () => {
  const recorded = { uri: "file:///cache/note.m4a", durationSeconds: 42 };

  it("nomme la note vocale, la mesure et reporte la durée déclarée par l'enregistreur", () => {
    fileSizes.set(recorded.uri, 900_000);

    const media = prepareAudio(recorded, FEEDBACK_MEDIA_PROFILE);

    expect(media).toMatchObject({
      type: MediaType.AUDIO,
      uri: recorded.uri,
      mimeType: "audio/m4a",
      size: 900_000,
      durationSeconds: 42,
    });
    expect(media.fileName).toMatch(/^note-\d+\.m4a$/);
  });

  it("refuse une note trop longue en citant le plafond en MINUTES", () => {
    const error = expectRejection(() =>
      prepareAudio({ ...recorded, durationSeconds: 400 }, FEEDBACK_MEDIA_PROFILE),
    );

    expect(error.reasonKey).toBe("feedback.media.audioTooLong");
    expect(error.params).toEqual({ max: 5 });
  });

  /**
   * LA raison d'être du profil : la même note vocale de 20 Mo est légitime dans un débrief
   * (100 Mo) et refusée dans un fil (10 Mo). Si ce test tombe, c'est que le plafond a cessé
   * d'être lu sur le profil pour redevenir une constante en dur.
   */
  it("applique le plafond de taille du PROFIL, pas un plafond unique", () => {
    fileSizes.set(recorded.uri, 20 * 1024 * 1024);

    expect(prepareAudio(recorded, FEEDBACK_MEDIA_PROFILE).size).toBe(20 * 1024 * 1024);

    const error = expectRejection(() => prepareAudio(recorded, MESSAGE_MEDIA_PROFILE));
    expect(error.reasonKey).toBe("messages.media.audioTooBig");
    expect(error.params).toEqual({ max: 10 });
  });
});

describe("mediaErrorMessage", () => {
  const t = ((key: string, params?: Record<string, unknown>) =>
    params == null ? key : `${key}:${JSON.stringify(params)}`) as unknown as TFunction;

  it("dit d'abord le refus qui a précédé l'envoi, avant toute erreur d'envoi", () => {
    const ignored = new MediaRejectedError("feedback.media.imageTooBig");
    expect(mediaErrorMessage(ignored, "feedback.media.permission", t, FEEDBACK_MEDIA_PROFILE)).toBe(
      "feedback.media.permission",
    );
  });

  it("ne dit rien quand rien n'a échoué", () => {
    expect(mediaErrorMessage(null, null, t, FEEDBACK_MEDIA_PROFILE)).toBeNull();
  });

  it("traduit un refus métier avec ses paramètres, pour que le plafond cité soit le vrai", () => {
    const error = new MediaRejectedError("feedback.media.audioTooLong", { max: 5 });
    expect(mediaErrorMessage(error, null, t, FEEDBACK_MEDIA_PROFILE)).toBe(
      'feedback.media.audioTooLong:{"max":5}',
    );
  });

  it("garde le message de l'API sur une panne technique, sans le remplacer par un libellé", () => {
    const error = new ApiError(409, "Ce débrief est complet", null);
    expect(mediaErrorMessage(error, null, t, FEEDBACK_MEDIA_PROFILE)).toBe(
      "Ce débrief est complet",
    );
  });

  it("se replie sur la clé du PROFIL quand l'erreur ne dit rien d'exploitable", () => {
    expect(mediaErrorMessage(new Error("boom"), null, t, FEEDBACK_MEDIA_PROFILE)).toBe(
      "feedback.media.uploadError",
    );
    expect(mediaErrorMessage(new Error("boom"), null, t, MESSAGE_MEDIA_PROFILE)).toBe(
      "messages.media.uploadError",
    );
  });
});

/** Variante synchrone de `rejection`, pour les préparations qui ne rendent pas de promesse. */
function expectRejection(run: () => unknown): MediaRejectedError {
  try {
    run();
  } catch (error) {
    if (error instanceof MediaRejectedError) return error;
    throw error;
  }
  throw new Error("aucun refus levé");
}

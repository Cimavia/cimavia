import { describe, expect, it } from "vitest";
import {
  attachFeedbackMediaSchema,
  isAllowedFeedbackAudioMime,
  MAX_FEEDBACK_AUDIO_SIZE_BYTES,
  MediaType,
  maxFeedbackMediaCount,
  maxFeedbackMediaSizeBytes,
  requestFeedbackUploadUrlSchema,
  upsertSessionFeedbackSchema,
} from "./feedback.schema";
import {
  MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
} from "./media.schema";

describe("upsertSessionFeedbackSchema", () => {
  it("accepte un débrief sans texte (débrief média-seul, complété en plusieurs fois)", () => {
    expect(upsertSessionFeedbackSchema.safeParse({ content: null }).success).toBe(true);
    expect(upsertSessionFeedbackSchema.safeParse({}).success).toBe(true);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    const result = upsertSessionFeedbackSchema.safeParse({
      content: "Bonne séance",
      status: "DONE",
    });
    expect(result.success).toBe(false);
  });
});

describe("requestFeedbackUploadUrlSchema", () => {
  const video = {
    type: MediaType.VIDEO,
    fileName: "essai.mp4",
    mimeType: "video/mp4",
    size: 1024,
    durationSeconds: 30,
  };

  it("accepte une vidéo dans les plafonds", () => {
    expect(requestFeedbackUploadUrlSchema.safeParse(video).success).toBe(true);
  });

  it("refuse une vidéo de plus de 60 s", () => {
    const result = requestFeedbackUploadUrlSchema.safeParse({
      ...video,
      durationSeconds: MAX_FEEDBACK_VIDEO_DURATION_SECONDS + 1,
    });
    expect(result.success).toBe(false);
  });

  it("refuse une vidéo de plus de 50 Mo", () => {
    const result = requestFeedbackUploadUrlSchema.safeParse({
      ...video,
      size: MAX_FEEDBACK_VIDEO_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("refuse un mime vidéo non supporté", () => {
    const result = requestFeedbackUploadUrlSchema.safeParse({ ...video, mimeType: "video/avi" });
    expect(result.success).toBe(false);
  });

  it("refuse une durée sur une photo (champ inconnu pour la branche IMAGE)", () => {
    const result = requestFeedbackUploadUrlSchema.safeParse({
      type: MediaType.IMAGE,
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      durationSeconds: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("attachFeedbackMediaSchema", () => {
  it("exige la clé objet issue de l'upload", () => {
    const result = attachFeedbackMediaSchema.safeParse({
      type: MediaType.IMAGE,
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });
});

describe("maxFeedbackMediaCount", () => {
  /**
   * Valeurs LITTÉRALES, relevées en a8feb3f : comparer la fonction à sa propre constante ne
   * protégeait rien (le test annonçait encore « 3 vidéos et 5 photos », un ancien plafond). Ce
   * quota désactive le bouton d'ajout ET fonde le 409 de l'API — le changer doit être voulu.
   */
  it("plafonne un débrief à 20 photos, 10 vidéos et 20 notes vocales", () => {
    expect(maxFeedbackMediaCount(MediaType.IMAGE)).toBe(20);
    expect(maxFeedbackMediaCount(MediaType.VIDEO)).toBe(10);
    expect(maxFeedbackMediaCount(MediaType.AUDIO)).toBe(20);
  });
});

describe("maxFeedbackMediaSizeBytes", () => {
  // Le plafond de poids suit le type : la vidéo est le principal poste de coût du stockage.
  it("borne chaque type de média à son propre poids", () => {
    expect(maxFeedbackMediaSizeBytes(MediaType.IMAGE)).toBe(MAX_FEEDBACK_PHOTO_SIZE_BYTES);
    expect(maxFeedbackMediaSizeBytes(MediaType.VIDEO)).toBe(MAX_FEEDBACK_VIDEO_SIZE_BYTES);
    expect(maxFeedbackMediaSizeBytes(MediaType.AUDIO)).toBe(MAX_FEEDBACK_AUDIO_SIZE_BYTES);
    expect(MAX_FEEDBACK_AUDIO_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe("isAllowedFeedbackAudioMime", () => {
  it.each(["audio/m4a", "audio/mp4", "audio/aac"])("accepte %s, capturé nativement", (mime) => {
    expect(isAllowedFeedbackAudioMime(mime)).toBe(true);
  });

  // Le débrief se fait sur mobile : pas de webm (enregistrement navigateur), contrairement à la
  // messagerie.
  it.each(["audio/webm", "audio/mpeg", "video/mp4", ""])("refuse %s", (mime) => {
    expect(isAllowedFeedbackAudioMime(mime)).toBe(false);
  });
});

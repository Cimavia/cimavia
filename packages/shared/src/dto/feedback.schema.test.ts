import { describe, expect, it } from "vitest";
import {
  attachFeedbackMediaSchema,
  MAX_FEEDBACK_PHOTOS,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEOS,
  MediaType,
  maxFeedbackMediaCount,
  requestFeedbackUploadUrlSchema,
  upsertSessionFeedbackSchema,
} from "./feedback.schema";

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
  it("plafonne à 3 vidéos et 5 photos par débrief", () => {
    expect(maxFeedbackMediaCount(MediaType.VIDEO)).toBe(MAX_FEEDBACK_VIDEOS);
    expect(maxFeedbackMediaCount(MediaType.IMAGE)).toBe(MAX_FEEDBACK_PHOTOS);
  });
});

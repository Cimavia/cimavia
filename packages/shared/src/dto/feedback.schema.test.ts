import { describe, expect, it } from "vitest";
import { TRAINING_DURATION_MAX_SECONDS } from "../util/training-duration.util";
import {
  BLOCK_MAX_TRACKING_UNITS,
  BlockType,
  EMOM_MIN_INTERVAL_SECONDS,
  EXERCISE_MAX_BLOCKS,
  emomTopCount,
  exerciseTrackingSchema,
} from "./exercise-block.schema";
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
import { SESSION_MAX_EXERCISES } from "./session.schema";

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

describe("le suivi remonté avec un débrief (#297)", () => {
  const withTracking = (tracking: unknown) => upsertSessionFeedbackSchema.safeParse({ tracking });
  const keyed = <T>(count: number, value: T) =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, value]));

  it("accepte un exercice par exercice que la séance peut porter, pas un de plus", () => {
    expect(withTracking(keyed(SESSION_MAX_EXERCISES, null)).success).toBe(true);
    expect(withTracking(keyed(SESSION_MAX_EXERCISES + 1, null)).success).toBe(false);
  });

  it("accepte un état par bloc que l'exercice peut porter, pas un de plus", () => {
    const blocks = (count: number) => ({ sse_1: keyed(count, { rounds: 1 }) });
    expect(withTracking(blocks(EXERCISE_MAX_BLOCKS)).success).toBe(true);
    expect(withTracking(blocks(EXERCISE_MAX_BLOCKS + 1)).success).toBe(false);
  });

  it("refuse une case cochée deux fois : elle se comptait deux fois", () => {
    const result = withTracking({ sse_1: { b: { checked: [0, 0, 0, 0, 0, 1] } } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Une case ne peut être cochée qu'une fois.");
  });

  it("accepte toutes les cases de l'EMOM le plus long, que le plafond de lignes refuserait", () => {
    const tops = emomTopCount({
      type: BlockType.EMOM,
      totalDurationSeconds: TRAINING_DURATION_MAX_SECONDS,
      intervalSeconds: EMOM_MIN_INTERVAL_SECONDS,
    });
    expect(tops).toBe(BLOCK_MAX_TRACKING_UNITS);
    const checked = Array.from({ length: tops }, (_, index) => index);
    expect(withTracking({ sse_1: { b: { checked } } }).success).toBe(true);
    expect(withTracking({ sse_1: { b: { checked: [...checked, tops] } } }).success).toBe(false);
  });

  it("laisse la relecture accepter ce que l'entrée refuse : un suivi stocké reste lisible", () => {
    const stored = { ...keyed(EXERCISE_MAX_BLOCKS + 1, { rounds: 1 }), b: { checked: [1, 1] } };
    expect(exerciseTrackingSchema.safeParse(stored).success).toBe(true);
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

  // Le drapeau est optionnel : une app pas encore mise à jour ne l'envoie pas (#537).
  it("accepte un rattachement avec ou sans la suite d'un lot", () => {
    const media = {
      type: MediaType.IMAGE,
      storagePath: "a/b.jpg",
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    };

    expect(attachFeedbackMediaSchema.safeParse(media).success).toBe(true);
    expect(attachFeedbackMediaSchema.safeParse({ ...media, continuesBatch: true }).success).toBe(
      true,
    );
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

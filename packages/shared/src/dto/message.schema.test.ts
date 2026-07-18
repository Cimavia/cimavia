import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MESSAGE_TEXT_MAX_LENGTH,
  MessageType,
  openConversationSchema,
  requestMessageUploadUrlSchema,
  sendMessageSchema,
} from "./message.schema";

describe("sendMessageSchema", () => {
  it("accepte un message texte", () => {
    const result = sendMessageSchema.safeParse({ type: MessageType.TEXT, content: "Salut coach" });
    expect(result.success).toBe(true);
  });

  it("refuse un texte vide", () => {
    const result = sendMessageSchema.safeParse({ type: MessageType.TEXT, content: "" });
    expect(result.success).toBe(false);
  });

  it("refuse un texte trop long", () => {
    const result = sendMessageSchema.safeParse({
      type: MessageType.TEXT,
      content: "x".repeat(MESSAGE_TEXT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("refuse un contenu texte sur une branche média (champ inconnu, schéma strict)", () => {
    const result = sendMessageSchema.safeParse({
      type: MessageType.AUDIO,
      storagePath: "a/b.m4a",
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: 1024,
      durationSeconds: 12,
      content: "légende interdite",
    });
    expect(result.success).toBe(false);
  });

  it("accepte un média audio avec rattachement optionnel à une séance", () => {
    const result = sendMessageSchema.safeParse({
      type: MessageType.AUDIO,
      storagePath: "a/b.m4a",
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: 1024,
      durationSeconds: 12,
      scheduledSessionId: "sess_1",
    });
    expect(result.success).toBe(true);
  });

  it("refuse un mime audio non supporté", () => {
    const result = sendMessageSchema.safeParse({
      type: MessageType.AUDIO,
      storagePath: "a/b.ogg",
      fileName: "note.ogg",
      mimeType: "audio/ogg",
      size: 1024,
      durationSeconds: 12,
    });
    expect(result.success).toBe(false);
  });
});

describe("requestMessageUploadUrlSchema", () => {
  it("refuse une note vocale trop lourde", () => {
    const result = requestMessageUploadUrlSchema.safeParse({
      type: MessageType.AUDIO,
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: MAX_MESSAGE_AUDIO_SIZE_BYTES + 1,
      durationSeconds: 12,
    });
    expect(result.success).toBe(false);
  });

  it("refuse une note vocale trop longue", () => {
    const result = requestMessageUploadUrlSchema.safeParse({
      type: MessageType.AUDIO,
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: 1024,
      durationSeconds: MAX_MESSAGE_AUDIO_DURATION_SECONDS + 1,
    });
    expect(result.success).toBe(false);
  });

  it("refuse un texte (pas de média à uploader)", () => {
    const result = requestMessageUploadUrlSchema.safeParse({
      type: MessageType.TEXT,
      content: "coucou",
    });
    expect(result.success).toBe(false);
  });
});

describe("openConversationSchema", () => {
  it("accepte une ouverture côté athlète (aucun champ)", () => {
    expect(openConversationSchema.safeParse({}).success).toBe(true);
  });

  it("accepte une ouverture côté coach (athleteId)", () => {
    expect(openConversationSchema.safeParse({ athleteId: "ath_1" }).success).toBe(true);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    expect(openConversationSchema.safeParse({ coachId: "c_1" }).success).toBe(false);
  });
});

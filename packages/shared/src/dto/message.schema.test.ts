import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MESSAGE_TEXT_MAX_LENGTH,
  MessageAttachmentType,
  MessageType,
  messageDtoSchema,
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

describe("messageDtoSchema — le rattachement résolu", () => {
  const base = {
    id: "m1",
    conversationId: "c1",
    senderId: "u1",
    type: MessageType.TEXT,
    content: "J'ai lu ton débrief",
    media: null,
    readAt: null,
    createdAt: "2026-10-16T19:42:00.000Z",
  };

  it("porte le titre et la date de la séance, jamais un libellé tout fait", () => {
    const result = messageDtoSchema.safeParse({
      ...base,
      scheduledSessionId: null,
      sessionFeedbackId: "f1",
      attachment: {
        type: MessageAttachmentType.SESSION_FEEDBACK,
        id: "f1",
        scheduledSessionId: "s1",
        sessionTitle: "Voie & projet 7b",
        scheduledDate: "2026-10-16",
      },
    });
    expect(result.success).toBe(true);
  });

  /**
   * L'id brut et le rattachement résolu sont INDÉPENDANTS : la FK est `SetNull`, mais entre la
   * suppression de la cible et sa relecture, et surtout quand la cible est hors de portée du
   * lecteur, un message garde son id et n'a pas de libellé. Le client doit rendre une bulle
   * ordinaire dans ce cas, pas un « à propos de quelque chose ».
   */
  it("accepte un id de cible sans rattachement résolu (cible hors de portée ou supprimée)", () => {
    const result = messageDtoSchema.safeParse({
      ...base,
      scheduledSessionId: null,
      sessionFeedbackId: "f1",
      attachment: null,
    });
    expect(result.success).toBe(true);
  });

  it("refuse un rattachement sans séance rattachée (rien où naviguer)", () => {
    const result = messageDtoSchema.safeParse({
      ...base,
      scheduledSessionId: "s1",
      sessionFeedbackId: null,
      attachment: {
        type: MessageAttachmentType.SCHEDULED_SESSION,
        id: "s1",
        sessionTitle: "Voie & projet 7b",
        scheduledDate: "2026-10-16",
      },
    });
    expect(result.success).toBe(false);
  });
});

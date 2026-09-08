import { describe, expect, it } from "vitest";
import {
  FEEDBACK_EVENT_LABEL_KEY,
  FEEDBACK_EVENT_MESSAGE_TYPES,
  isFeedbackEventMessage,
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

describe("avis de débrief", () => {
  /**
   * LA garantie qui rend ces types sûrs : `sendMessageSchema` est une union discriminée sur les
   * quatre types qu'un humain écrit. Un client qui tenterait de se fabriquer un avis — donc de
   * faire dire au fil que l'athlète a débriefé — est refusé par le pipe, avant tout service.
   */
  it("n'est jamais acceptable en entrée d'envoi, quoi qu'un client tente", () => {
    for (const type of FEEDBACK_EVENT_MESSAGE_TYPES) {
      expect(sendMessageSchema.safeParse({ type }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ type, sessionFeedbackId: "f1" }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ type, content: "j'ai débriefé" }).success).toBe(false);
    }
  });

  it("se distingue des types qu'un humain écrit", () => {
    expect(isFeedbackEventMessage(MessageType.FEEDBACK_CREATED)).toBe(true);
    expect(isFeedbackEventMessage(MessageType.FEEDBACK_UPDATED)).toBe(true);
    expect(isFeedbackEventMessage(MessageType.TEXT)).toBe(false);
    expect(isFeedbackEventMessage(MessageType.AUDIO)).toBe(false);
  });

  // Un avis n'a ni texte ni média : c'est un pointeur vers le débrief, et rien d'autre.
  it("traverse le DTO sans contenu ni média", () => {
    const result = messageDtoSchema.safeParse({
      id: "m1",
      conversationId: "c1",
      senderId: "u1",
      type: MessageType.FEEDBACK_CREATED,
      content: null,
      media: null,
      scheduledSessionId: null,
      sessionFeedbackId: "f1",
      attachment: null,
      readAt: null,
      createdAt: "2026-09-07T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("porte une clé de libellé par type, littérale et distincte", () => {
    const keys = FEEDBACK_EVENT_MESSAGE_TYPES.map((type) => FEEDBACK_EVENT_LABEL_KEY[type]);
    expect(keys).toEqual(["messages.feedback.created", "messages.feedback.updated"]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

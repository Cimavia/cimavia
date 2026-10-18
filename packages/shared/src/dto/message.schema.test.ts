import { describe, expect, it } from "vitest";
import {
  createConversationSchema,
  FEEDBACK_EVENT_LABEL_KEY,
  FEEDBACK_EVENT_MESSAGE_TYPES,
  isAllowedMessageAudioMime,
  isFeedbackEventMessage,
  MAX_CONVERSATION_PARTICIPANTS,
  MAX_MESSAGE_AUDIO_DURATION_SECONDS,
  MAX_MESSAGE_AUDIO_SIZE_BYTES,
  MESSAGE_TEXT_MAX_LENGTH,
  MessageAttachmentType,
  MessageType,
  messageDtoSchema,
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

  // Un texte n'appartient à aucun lot : il est toujours un geste à lui seul (#537).
  it("accepte la suite d'un lot sur un média, la refuse sur un texte", () => {
    const image = {
      type: MessageType.IMAGE,
      storagePath: "a/b.jpg",
      fileName: "voie.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      continuesBatch: true,
    };
    const text = { type: MessageType.TEXT, content: "Salut", continuesBatch: true };

    expect(sendMessageSchema.safeParse(image).success).toBe(true);
    expect(sendMessageSchema.safeParse(text).success).toBe(false);
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

describe("createConversationSchema", () => {
  const coach = (userId: string) => ({ userId, capability: "coach" as const });

  it("accepte un participant, à deux, et plusieurs, à plusieurs", () => {
    expect(createConversationSchema.safeParse({ participants: [coach("c_1")] }).success).toBe(true);
    const group = { participants: [coach("c_1"), { userId: "a_1", capability: "athlete" }] };
    expect(createConversationSchema.safeParse(group).success).toBe(true);
  });

  it("refuse une conversation sans personne en face", () => {
    expect(createConversationSchema.safeParse({ participants: [] }).success).toBe(false);
  });

  it("borne le nombre d'autres participants", () => {
    const at = (count: number) => Array.from({ length: count }, (_, index) => coach(`c_${index}`));

    expect(
      createConversationSchema.safeParse({ participants: at(MAX_CONVERSATION_PARTICIPANTS) })
        .success,
    ).toBe(true);
    expect(
      createConversationSchema.safeParse({ participants: at(MAX_CONVERSATION_PARTICIPANTS + 1) })
        .success,
    ).toBe(false);
  });

  // Une même personne sous deux capacités ferait deux participants d'un seul compte.
  it("refuse un participant nommé deux fois, même sous deux capacités", () => {
    const twice = { participants: [coach("u_1"), { userId: "u_1", capability: "athlete" }] };
    expect(createConversationSchema.safeParse(twice).success).toBe(false);
  });

  it("refuse le compte Entreprise, un identifiant vide et un champ inconnu", () => {
    const company = { participants: [{ userId: "o_1", capability: "company" }] };
    expect(createConversationSchema.safeParse(company).success).toBe(false);
    expect(createConversationSchema.safeParse({ participants: [coach("")] }).success).toBe(false);
    expect(createConversationSchema.safeParse({ athleteId: "a_1" }).success).toBe(false);
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

describe("isAllowedMessageAudioMime", () => {
  // La messagerie s'ouvre aussi au web : l'enregistrement du navigateur produit du webm.
  it.each(["audio/m4a", "audio/mp4", "audio/aac", "audio/webm"])("accepte %s", (mime) => {
    expect(isAllowedMessageAudioMime(mime)).toBe(true);
  });

  it.each(["audio/mpeg", "video/webm", ""])("refuse %s", (mime) => {
    expect(isAllowedMessageAudioMime(mime)).toBe(false);
  });
});

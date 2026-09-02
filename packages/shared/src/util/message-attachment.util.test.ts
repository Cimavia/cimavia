import { describe, expect, it } from "vitest";
import { MessageAttachmentType } from "../dto/message.schema";
import {
  AttachmentDestination,
  attachmentTarget,
  MESSAGE_ATTACHMENT_LABEL_KEY,
} from "./message-attachment.util";

const feedbackAttachment = {
  type: MessageAttachmentType.SESSION_FEEDBACK,
  id: "f1",
  scheduledSessionId: "s1",
  sessionTitle: "Voie & projet 7b",
  scheduledDate: "2026-10-16",
};

const sessionAttachment = {
  ...feedbackAttachment,
  type: MessageAttachmentType.SCHEDULED_SESSION,
  id: "s1",
};

describe("attachmentTarget", () => {
  it("mène l'athlète à la séance citée", () => {
    expect(attachmentTarget(sessionAttachment, "athlete")).toEqual({
      destination: AttachmentDestination.SESSION,
      scheduledSessionId: "s1",
    });
  });

  it("mène l'athlète à son débrief quand c'est lui qui est cité", () => {
    expect(attachmentTarget(feedbackAttachment, "athlete")).toEqual({
      destination: AttachmentDestination.FEEDBACK,
      scheduledSessionId: "s1",
    });
  });

  /**
   * Le cas qui justifie cette fonction. C'est l'ATHLÈTE qui cite le plus souvent une séance, et
   * c'est le COACH qui lit ce message — or il n'existe aucune page de séance côté coach. Envoyer
   * la puce vers une route inexistante serait un cul-de-sac ; le débrief, lui, est l'endroit où il
   * a quelque chose à faire de cette séance.
   */
  it("mène le coach au débrief, même quand c'est une séance qui est citée", () => {
    expect(attachmentTarget(sessionAttachment, "coach")).toEqual({
      destination: AttachmentDestination.FEEDBACK,
      scheduledSessionId: "s1",
    });
  });
});

describe("MESSAGE_ATTACHMENT_LABEL_KEY", () => {
  // Deux clés distinctes : « à propos de ta séance » et « à propos de ton débrief » ne se disent
  // pas pareil, et le serveur n'en rend aucune des deux.
  it("donne une clé par type de cible", () => {
    expect(MESSAGE_ATTACHMENT_LABEL_KEY[MessageAttachmentType.SCHEDULED_SESSION]).toBe(
      "messages.attachment.session",
    );
    expect(MESSAGE_ATTACHMENT_LABEL_KEY[MessageAttachmentType.SESSION_FEEDBACK]).toBe(
      "messages.attachment.feedback",
    );
  });
});

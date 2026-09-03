import { describe, expect, it, vi } from "vitest";
import { feedbackReplyAttachment, feedbackReplySurface } from "./feedback-reply.util";

const READY = { feedbackId: "f-1", conversationId: "c-1", isThreadError: false, onSent: () => {} };

describe("feedbackReplyAttachment", () => {
  it("rattache la réponse au débrief cité", () => {
    expect(feedbackReplyAttachment("f-1")).toEqual({ sessionFeedbackId: "f-1" });
  });

  /**
   * `undefined` et non `{ sessionFeedbackId: null }` : il se répand tel quel dans l'entrée
   * d'envoi, où une clé posée à `null` dirait « détache », pas « ne touche à rien ».
   */
  it("ne rattache rien tant que le débrief n'est pas chargé", () => {
    expect(feedbackReplyAttachment(null)).toBeUndefined();
  });
});

describe("feedbackReplySurface", () => {
  // Les DEUX sont nécessaires : sans débrief on ne sait pas quoi citer, sans fil la réponse
  // n'aboutit nulle part. Laisser écrire sur un seul des deux perdrait le texte à l'envoi.
  it("n'est prêt qu'avec la cible ET le fil", () => {
    const send = vi.fn();
    expect(feedbackReplySurface(READY, false, send).ready).toBe(true);
    expect(feedbackReplySurface({ ...READY, feedbackId: null }, false, send).ready).toBe(false);
    expect(feedbackReplySurface({ ...READY, conversationId: undefined }, false, send).ready).toBe(
      false,
    );
  });

  it("porte l'échec du fil et l'envoi de texte tels quels", () => {
    const sendText = vi.fn();
    const surface = feedbackReplySurface({ ...READY, isThreadError: true }, true, sendText);

    expect(surface.hasThreadError).toBe(true);
    expect(surface.sending).toBe(true);
    surface.sendText("Bien joué");
    expect(sendText).toHaveBeenCalledWith("Bien joué");
  });
});

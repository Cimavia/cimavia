import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSendMessage } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";

vi.mock("@/feature/message/hook/useMessages", () => ({ useSendMessage: vi.fn() }));
vi.mock("@/feature/message/hook/useSendMessageMedia", () => ({ useSendMessageMedia: vi.fn() }));

const mutate = vi.fn();
const onSent = vi.fn();

function setup(feedbackId: string | null, conversationId: string | undefined) {
  vi.mocked(useSendMessage).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
    typeof useSendMessage
  >);
  vi.mocked(useSendMessageMedia).mockReturnValue({
    sendFiles: vi.fn(),
    sendAudio: vi.fn(),
    isUploading: false,
    step: null,
    progress: 0,
  } as unknown as ReturnType<typeof useSendMessageMedia>);

  return renderHook(() =>
    useFeedbackReply({ feedbackId, conversationId, isThreadError: false, onSent }),
  ).result.current;
}

describe("useFeedbackReply (web)", () => {
  /**
   * Le rattachement descend jusqu'aux DEUX mutations : sans lui sur celle des médias, une note
   * vocale enregistrée depuis le débrief partirait nue dans le fil.
   */
  it("rattache le débrief au texte comme aux médias", () => {
    setup("f-1", "c-1");

    expect(useSendMessage).toHaveBeenCalledWith("c-1", { sessionFeedbackId: "f-1" });
    expect(useSendMessageMedia).toHaveBeenCalledWith("c-1", {
      attachment: { sessionFeedbackId: "f-1" },
      onSent,
    });
  });

  // Un envoi rafraîchit AUSSI le débrief : sans ça, la réponse n'apparaît que dans le fil, pas là
  // où on vient de l'écrire.
  it("recharge le débrief après un envoi de texte", () => {
    setup("f-1", "c-1").sendText("Reçu");

    expect(mutate).toHaveBeenCalledWith({ type: "TEXT", content: "Reçu" }, { onSuccess: onSent });
  });

  it("n'est pas prêt tant que le fil n'est pas résolu", () => {
    expect(setup("f-1", undefined).ready).toBe(false);
    expect(setup(null, "c-1").ready).toBe(false);
    expect(setup("f-1", "c-1").ready).toBe(true);
  });
});

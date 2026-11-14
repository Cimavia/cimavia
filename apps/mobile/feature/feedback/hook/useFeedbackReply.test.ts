import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";

vi.mock("@/feature/message/hook/useConversation", () => ({ useSendMessage: vi.fn() }));
vi.mock("@/feature/message/hook/useMessageMedia", () => ({ useSendMessageMedia: vi.fn() }));

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const onSent = vi.fn();

function setup(feedbackId: string | null, conversationId: string | undefined) {
  vi.mocked(useSendMessage).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useSendMessage>);
  vi.mocked(useSendMessageMedia).mockReturnValue({
    pickAndSend: vi.fn(),
    recordAndSend: vi.fn(),
    isUploading: false,
    step: null,
    audioError: null,
  } as unknown as ReturnType<typeof useSendMessageMedia>);

  return renderHook(() =>
    useFeedbackReply({ feedbackId, conversationId, isThreadError: false, onSent }, "coach"),
  ).result.current;
}

describe("useFeedbackReply (mobile)", () => {
  /**
   * Le rattachement descend jusqu'aux DEUX mutations : sans lui sur celle des médias, une note
   * vocale enregistrée depuis le débrief partirait nue dans le fil. Le titre de l'écran aussi :
   * laissé au sélecteur, il faisait refuser la réponse par l'API (#343).
   */
  it("rattache le débrief et le titre de l'écran au texte comme aux médias", () => {
    setup("f-1", "c-1");

    expect(useSendMessage).toHaveBeenCalledWith("c-1", { sessionFeedbackId: "f-1" }, "coach");
    expect(useSendMessageMedia).toHaveBeenCalledWith("c-1", {
      attachment: { sessionFeedbackId: "f-1" },
      onSent,
      pinned: "coach",
    });
  });

  // Un envoi rafraîchit AUSSI le débrief : sans ça, la réponse n'apparaît que dans le fil, pas là
  // où on vient de l'écrire.
  it("recharge le débrief après un envoi de texte", async () => {
    await setup("f-1", "c-1").sendText("Reçu");

    expect(mutateAsync).toHaveBeenCalledWith(
      { type: "TEXT", content: "Reçu" },
      { onSuccess: onSent },
    );
  });

  it("n'est pas prêt tant que le fil n'est pas résolu", () => {
    expect(setup("f-1", undefined).ready).toBe(false);
    expect(setup(null, "c-1").ready).toBe(false);
    expect(setup("f-1", "c-1").ready).toBe(true);
  });
});

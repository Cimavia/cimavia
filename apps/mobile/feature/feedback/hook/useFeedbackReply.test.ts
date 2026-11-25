import { ApiError, ProblemType } from "@cmv/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";

vi.mock("@/feature/message/hook/useConversation", () => ({ useSendMessage: vi.fn() }));
vi.mock("@/feature/message/hook/useMessageMedia", () => ({ useSendMessageMedia: vi.fn() }));

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const onSent = vi.fn();
const onFollowEnded = vi.fn();

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
    clearAudioError: vi.fn(),
  } as unknown as ReturnType<typeof useSendMessageMedia>);

  return renderHook(() =>
    useFeedbackReply(
      { feedbackId, conversationId, isThreadError: false, onSent },
      "coach",
      onFollowEnded,
    ),
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

    expect(useSendMessage).toHaveBeenCalledWith("c-1", {
      attachment: { sessionFeedbackId: "f-1" },
      pinned: "coach",
    });
    expect(useSendMessageMedia).toHaveBeenCalledWith("c-1", {
      attachment: { sessionFeedbackId: "f-1" },
      pinned: "coach",
      onSent,
    });
  });

  // Un envoi rafraîchit AUSSI le débrief : sans ça, la réponse n'apparaît que dans le fil, pas là
  // où on vient de l'écrire.
  it("recharge le débrief après un envoi de texte", async () => {
    await setup("f-1", "c-1").sendText("Reçu");

    expect(mutateAsync).toHaveBeenCalledWith(
      { type: "TEXT", content: "Reçu" },
      expect.objectContaining({ onSuccess: onSent }),
    );
  });

  // Un refus de fin de suivi (#911) fait relire à l'écran ce qui dit la fin : sans ça, la barre
  // resterait ouverte sur un fil fermé, et chaque nouvel essai buterait sur le même 409.
  it.each([
    { type: ProblemType.FOLLOW_ENDED, relu: 1 },
    { type: ProblemType.STALE_WRITE, relu: 0 },
  ])("relit l'écran sur un refus $type : $relu fois", async ({ type, relu }) => {
    onFollowEnded.mockClear();
    await setup("f-1", "c-1").sendText("Reçu");
    const options = mutateAsync.mock.lastCall?.[1] as { onError: (error: unknown) => void };

    options.onError(new ApiError(409, "Refus", null, true, type));

    expect(onFollowEnded).toHaveBeenCalledTimes(relu);
  });

  it("n'est pas prêt tant que le fil n'est pas résolu", () => {
    expect(setup("f-1", undefined).ready).toBe(false);
    expect(setup(null, "c-1").ready).toBe(false);
    expect(setup("f-1", "c-1").ready).toBe(true);
  });
});

import { type MessageDto, messageKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useMessages } from "./useConversation";

const { getMessagesMock } = vi.hoisted(() => ({ getMessagesMock: vi.fn() }));

vi.mock("@/feature/message/api", async () => ({
  messageApi: { getMessages: getMessagesMock },
  messageKeys: (await import("@cmv/shared")).messageKeys,
}));

vi.mock("@/shared/hook/useExercisedCapability", () => ({ useExercisedCapability: () => null }));

// Le sondage au premier plan n'est pas le sujet : on rend l'écran « au premier plan » une fois.
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));

const voiceNote = (signedAt: number): MessageDto => ({
  id: "m-voice",
  conversationId: "c1",
  senderId: "u1",
  type: "AUDIO",
  content: null,
  media: {
    url: `https://s3.test/note.m4a?X-Amz-Date=${signedAt}`,
    fileName: "note.m4a",
    mimeType: "audio/mp4",
    sizeBytes: 10,
    durationSeconds: 90,
  },
  scheduledSessionId: null,
  sessionFeedbackId: null,
  attachment: null,
  readAt: null,
  createdAt: "2026-09-25T12:00:00.000Z",
});

describe("useMessages", () => {
  /**
   * #304 : le fil est sondé toutes les 10 s et chaque réponse re-signe les médias. `CmvAudioPlayer`
   * recréait son lecteur sur la nouvelle URL — la note vocale repartait de zéro.
   */
  it("garde l'URL du média d'une réponse à l'autre tant qu'elle est ouvrable", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    getMessagesMock.mockResolvedValueOnce([voiceNote(0)]);
    const { result } = renderHook(() => useMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;

    getMessagesMock.mockResolvedValueOnce([voiceNote(10)]);
    await result.current.refetch();

    const cached = queryClient.getQueryData<MessageDto[]>(messageKeys.thread("c1", null));
    expect(getMessagesMock).toHaveBeenCalledTimes(2);
    expect(cached?.[0]?.media?.url).toBe("https://s3.test/note.m4a?X-Amz-Date=0");
    expect(cached).toBe(first);
  });
});

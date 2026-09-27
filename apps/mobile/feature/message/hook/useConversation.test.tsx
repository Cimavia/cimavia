import { type CapabilityName, type MessageDto, messageKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarkRead, useMessages, useSendMessage } from "./useConversation";

const { getMessagesMock, markReadMock, sendMessageMock, exercised } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
  markReadMock: vi.fn(),
  sendMessageMock: vi.fn(),
  exercised: { as: null as CapabilityName | null },
}));

vi.mock("@/feature/message/api", async () => ({
  messageApi: {
    getMessages: getMessagesMock,
    markRead: markReadMock,
    sendMessage: sendMessageMock,
  },
  messageKeys: (await import("@cmv/shared")).messageKeys,
}));

vi.mock("@/shared/hook/useExercisedCapability", () => ({
  useExercisedCapability: () => exercised.as,
}));

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

/**
 * #309 : lire ou écrire dans un fil change sa ligne dans la liste du coach — la pastille, l'aperçu.
 * Le mobile n'invalidait que `myConversation()`, dont aucun écran ne lit autre chose que l'id : la
 * liste restait sur l'état d'avant jusqu'au tirer-pour-rafraîchir.
 */
describe("invalidation de la liste des fils", () => {
  afterEach(() => {
    exercised.as = null;
  });

  /** Un cache où la liste du coach et le fil de l'athlète sont déjà chargés, et frais. */
  function seededClient() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(messageKeys.conversations("coach"), []);
    queryClient.setQueryData(messageKeys.myConversation(), { id: "c1" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const isInvalidated = (queryKey: readonly unknown[]) =>
      queryClient.getQueryState(queryKey)?.isInvalidated;
    return { wrapper, isInvalidated };
  }

  type Mutations = {
    markRead: ReturnType<typeof useMarkRead>;
    send: ReturnType<typeof useSendMessage>;
  };

  it.each<[string, (mutations: Mutations) => Promise<unknown>]>([
    ["le marquage lu", ({ markRead }) => markRead.mutateAsync()],
    ["l'envoi d'un message", ({ send }) => send.mutateAsync({ type: "TEXT", content: "Ok" })],
  ])("%s invalide la liste des fils à ce titre, pas le fil de l'athlète", async (_, run) => {
    exercised.as = "coach";
    markReadMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue({ id: "m1" });
    const { wrapper, isInvalidated } = seededClient();
    const { result } = renderHook(
      () => ({ markRead: useMarkRead("c1"), send: useSendMessage("c1") }),
      { wrapper },
    );

    expect(isInvalidated(messageKeys.conversations("coach"))).toBe(false);
    await run(result.current);

    expect(isInvalidated(messageKeys.conversations("coach"))).toBe(true);
    // Invalider le fil résolu rejouerait le get-or-create à chaque lecture, pour un id qui ne
    // change pas.
    expect(isInvalidated(messageKeys.myConversation())).toBe(false);
  });
});

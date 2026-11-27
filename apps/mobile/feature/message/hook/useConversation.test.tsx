import {
  ApiError,
  type ConversationDto,
  type MessageDto,
  type MessagePages,
  messageKeys,
  ProblemType,
  type TrainingCapability,
} from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFocusEffect } from "expo-router";
import { type EffectCallback, type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import {
  useConversation,
  useConversationCandidates,
  useConversations,
  useCreateConversation,
  useMarkRead,
  useMessages,
  useOpenCoachConversation,
  useSendMessage,
} from "./useConversation";

const {
  getMessagePageMock,
  getMessagesSinceMock,
  markReadMock,
  sendMessageMock,
  listConversationsMock,
  listCandidatesMock,
  createConversationMock,
  exercised,
} = vi.hoisted(() => ({
  getMessagePageMock: vi.fn(),
  getMessagesSinceMock: vi.fn(),
  markReadMock: vi.fn(),
  sendMessageMock: vi.fn(),
  listConversationsMock: vi.fn(),
  listCandidatesMock: vi.fn(),
  createConversationMock: vi.fn(),
  exercised: { as: null as TrainingCapability | null },
}));

vi.mock("@/feature/message/api", async () => ({
  messageApi: {
    getMessagePage: getMessagePageMock,
    getMessagesSince: getMessagesSinceMock,
    markRead: markReadMock,
    sendMessage: sendMessageMock,
    listConversations: listConversationsMock,
    listCandidates: listCandidatesMock,
    createConversation: createConversationMock,
  },
  messageKeys: (await import("@cmv/shared")).messageKeys,
}));

// La règle de priorité (titre imposé, sélecteur, persona) se teste avec le hook ; ici, seulement
// ce que chaque hook de données lui transmet.
vi.mock("@/shared/hook/useExercisedCapability", () => ({
  useExercisedCapability: vi.fn(() => exercised.as),
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
  createdAt: "2026-09-25T12:00:00.000Z",
});

const textMessage = (id: string): MessageDto => ({
  ...voiceNote(0),
  id,
  type: "TEXT",
  content: id,
  media: null,
});

const page = (items: MessageDto[], nextCursor: string | null = null) => ({ items, nextCursor });

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
    getMessagePageMock.mockResolvedValueOnce(page([voiceNote(0)]));
    const { result } = renderHook(() => useMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;

    getMessagePageMock.mockResolvedValueOnce(page([voiceNote(10)]));
    await act(() => result.current.refetch());

    const cached = queryClient.getQueryData<MessagePages>(messageKeys.thread("c1", null));
    expect(getMessagePageMock).toHaveBeenCalledTimes(2);
    expect(cached?.pages[0]?.items[0]?.media?.url).toBe("https://s3.test/note.m4a?X-Amz-Date=0");
    expect(result.current.data).toBe(first);
  });

  // #77 : l'écran reçoit le fil à plat, dans l'ordre de lecture ; la page d'avant part de SON curseur.
  it("rend le fil à plat, et charge la page d'avant par son curseur", async () => {
    getMessagePageMock
      .mockResolvedValueOnce(page([textMessage("m3"), textMessage("m4")], "c-m3"))
      .mockResolvedValueOnce(page([textMessage("m1"), textMessage("m2")]));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    expect(getMessagePageMock.mock.calls).toEqual([
      ["c1", null, null],
      ["c1", "c-m3", null],
    ]);
    await waitFor(() =>
      expect(result.current.data?.map(({ id }) => id)).toEqual(["m1", "m2", "m3", "m4"]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  /**
   * Deux pages chargées, un message arrivé. Relue comme « les 50 plus récents », la plus récente
   * perdait m3 par le bas, et les pages d'avant glissaient d'autant. Elle se relit depuis sa
   * frontière, et la page d'avant, lue à l'instant, n'est pas redemandée (#782).
   */
  it("relit la page la plus récente depuis sa frontière, sans redemander la page d'avant", async () => {
    getMessagePageMock
      .mockResolvedValueOnce(page([textMessage("m3"), textMessage("m4")], "c-m3"))
      .mockResolvedValueOnce(page([textMessage("m1"), textMessage("m2")]));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    await act(() => result.current.fetchNextPage());

    getMessagesSinceMock.mockResolvedValueOnce(
      page([textMessage("m3"), textMessage("m4"), textMessage("m5")], "c-m3"),
    );
    await act(() => result.current.refetch());

    expect(getMessagesSinceMock.mock.calls).toEqual([["c1", "c-m3", null]]);
    expect(getMessagePageMock).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.data?.map(({ id }) => id)).toEqual(["m1", "m2", "m3", "m4", "m5"]),
    );
  });
});

describe("useMessages — quand le fil se relit", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(useFocusEffect).mockReset();
  });

  it("ne demande rien tant qu'aucun fil n'est résolu", () => {
    const { result } = renderHook(() => useMessages(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMessagePageMock).not.toHaveBeenCalled();
  });

  /**
   * Au premier plan, le fil se relit à l'arrivée — le cache persisté montrerait l'état d'avant —,
   * puis toutes les 10 s. C'est le rythme de la messagerie asynchrone (CDC §5.8).
   */
  it("se relit à l'arrivée au premier plan, puis toutes les dix secondes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Le vrai hook déclenche à la prise de focus : l'écran monté EST l'écran au premier plan.
    vi.mocked(useFocusEffect).mockImplementation((callback: EffectCallback) => {
      // biome-ignore lint/correctness/useExhaustiveDependencies: fidèle au vrai hook, qui ne rejoue qu'au changement de focus
      useEffect(callback, []);
    });
    getMessagePageMock.mockResolvedValue(page([]));
    renderHook(() => useMessages("c1"), { wrapper });
    await waitFor(() => expect(getMessagePageMock).toHaveBeenCalled());
    const arrival = getMessagePageMock.mock.calls.length;

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(getMessagePageMock.mock.calls.length).toBeGreaterThan(arrival);
  });
});

/**
 * #309 : lire ou écrire dans un fil change sa ligne dans la liste du coach — la pastille, l'aperçu.
 * Le mobile n'invalidait que le fil résolu de l'athlète, dont aucun écran ne lit autre chose que l'id : la
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
    queryClient.setQueryData(messageKeys.conversationWithCoach("coach_1"), { id: "c1" });
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
    expect(isInvalidated(messageKeys.conversationWithCoach("coach_1"))).toBe(false);
  });

  /**
   * Un fil lu avant la rupture garde sa barre : relire la liste lui apporte sa fin de suivi (#911),
   * sans quoi chaque essai finirait sur le même refus. Un autre échec, lui, ne relit rien.
   */
  it.each([
    ["relit la liste des fils sur un refus pour suivi terminé", ProblemType.FOLLOW_ENDED, true],
    ["ne relit rien sur un autre refus", ProblemType.STALE_WRITE, false],
  ])("%s", async (_, type, invalidated) => {
    exercised.as = "coach";
    sendMessageMock.mockRejectedValue(new ApiError(409, "Refus", null, true, type));
    const { wrapper, isInvalidated } = seededClient();
    const { result } = renderHook(() => useSendMessage("c1"), { wrapper });

    await result.current.mutateAsync({ type: "TEXT", content: "Ok" }).catch(() => undefined);

    expect(isInvalidated(messageKeys.conversations("coach"))).toBe(invalidated);
  });
});

const listed = (id: string) => ({ id, participants: [] }) as unknown as ConversationDto;

function freshClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Un écran mono-titre lit et écrit au sien, quel que soit le sélecteur (#343). */
describe("titre imposé par l'écran (#343)", () => {
  it("transmet le titre imposé à la lecture des fils", () => {
    listConversationsMock.mockResolvedValue([]);
    const { wrapper } = freshClient();
    renderHook(() => useConversations("coach"), { wrapper });

    expect(useExercisedCapability).toHaveBeenLastCalledWith("coach");
  });

  it("transmet le titre imposé à l'envoi", () => {
    const { wrapper } = freshClient();
    renderHook(() => useSendMessage("c1", { pinned: "coach" }), { wrapper });

    expect(useExercisedCapability).toHaveBeenLastCalledWith("coach");
  });
});

describe("useConversation (#612)", () => {
  // `undefined` charge, `null` est chargé sans elle : l'écran attend l'un, dit la panne de l'autre.
  it("rend undefined tant que la liste charge, puis la conversation de la liste", async () => {
    listConversationsMock.mockResolvedValue([listed("cv-1"), listed("cv-2")]);
    const { wrapper } = freshClient();
    const { result } = renderHook(() => useConversation("cv-2"), { wrapper });

    expect(result.current.conversation).toBeUndefined();
    await waitFor(() => expect(result.current.conversation?.id).toBe("cv-2"));
  });

  it("rend null quand la liste chargée ne la porte pas", async () => {
    listConversationsMock.mockResolvedValue([listed("cv-1")]);
    const { wrapper } = freshClient();
    const { result } = renderHook(() => useConversation("perdue"), { wrapper });

    await waitFor(() => expect(result.current.conversation).toBeNull());
  });
});

describe("useConversationCandidates (#612)", () => {
  afterEach(() => {
    exercised.as = null;
  });

  it("demande les candidats au titre exercé", async () => {
    exercised.as = "coach";
    listCandidatesMock.mockResolvedValue({ athletes: [], coaches: [] });
    const { wrapper } = freshClient();
    const { result } = renderHook(() => useConversationCandidates(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ athletes: [], coaches: [] }));
    expect(listCandidatesMock).toHaveBeenCalledWith("coach");
  });
});

describe("useCreateConversation (#612)", () => {
  const input = { participants: [{ userId: "m", capability: "coach" as const }] };

  // Le fil se lit par son id DANS la liste : absente, la conversation créée ne s'ouvrirait pas.
  it("pose la conversation créée en tête de la liste, puis la relit", async () => {
    createConversationMock.mockResolvedValue(listed("new"));
    const { queryClient, wrapper } = freshClient();
    queryClient.setQueryData(messageKeys.conversations(null), [listed("old")]);
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    await act(() => result.current.mutateAsync(input));

    expect(createConversationMock).toHaveBeenCalledWith(input, null);
    const list = queryClient.getQueryData<ConversationDto[]>(messageKeys.conversations(null));
    expect(list?.map((conversation) => conversation.id)).toEqual(["new", "old"]);
    expect(queryClient.getQueryState(messageKeys.conversations(null))?.isInvalidated).toBe(true);
  });
});

describe("useOpenCoachConversation (#612)", () => {
  // Désigner un de ses coachs, c'est agir en athlète — quel que soit l'espace d'où l'on vient.
  it("ouvre le fil à deux avec ce coach, au titre d'athlète", async () => {
    exercised.as = "coach";
    createConversationMock.mockResolvedValue(listed("cv-c"));
    const { wrapper } = freshClient();
    const { result } = renderHook(() => useOpenCoachConversation(), { wrapper });

    const opened = await act(() => result.current.mutateAsync("coach-1"));

    expect(opened.id).toBe("cv-c");
    expect(createConversationMock).toHaveBeenCalledWith(
      { participants: [{ userId: "coach-1", capability: "coach" }] },
      "athlete",
    );
    exercised.as = null;
  });
});

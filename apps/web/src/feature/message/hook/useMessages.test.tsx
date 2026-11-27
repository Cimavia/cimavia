import type { MessageDto, MessagePages } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageKeys } from "@/feature/message/api";
import { renderWithQueryClient } from "../../../../test/query";
import { useConversations, useConversationWith, useThreadMessages } from "./useMessages";

const { getMessagePageMock, listConversationsMock, createConversationMock } = vi.hoisted(() => ({
  getMessagePageMock: vi.fn(),
  listConversationsMock: vi.fn(),
  createConversationMock: vi.fn(),
}));

vi.mock("@/feature/message/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/message/api")>()),
  messageApi: {
    getMessagePage: getMessagePageMock,
    listConversations: listConversationsMock,
    createConversation: createConversationMock,
  },
}));

vi.mock("@/shared/hook/useCapabilities", () => ({ useExercisedCapability: () => null }));

// Deux signatures du MÊME fichier ne diffèrent que par leur heure : c'est ce que renvoie l'API.
const voiceNote = (signedAt: string): MessageDto => ({
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

beforeEach(() => {
  getMessagePageMock.mockReset();
  listConversationsMock.mockReset().mockResolvedValue([]);
  createConversationMock.mockReset();
});

const textMessage = (id: string): MessageDto => ({
  ...voiceNote("0"),
  id,
  type: "TEXT",
  content: id,
  media: null,
});

describe("useThreadMessages", () => {
  /**
   * #304 : le fil est sondé toutes les 10 s et chaque réponse re-signe les médias. Remettre la
   * nouvelle URL au `<audio>` relançait son chargement — la note vocale repartait de zéro.
   */
  it("garde l'URL du média d'une réponse à l'autre tant qu'elle est ouvrable", async () => {
    getMessagePageMock.mockResolvedValueOnce({ items: [voiceNote("120000")], nextCursor: null });
    const { queryClient, wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useThreadMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = queryClient.getQueryData<MessagePages>(messageKeys.thread("c1", null));

    getMessagePageMock.mockResolvedValueOnce({ items: [voiceNote("120010")], nextCursor: null });
    await act(() => result.current.refetch());

    // Le CACHE, et non le rendu du hook : c'est lui que lisent toutes les surfaces, et il est à
    // jour dès que le rechargement rend la main — le rendu, lui, suit un tour plus tard.
    const cached = queryClient.getQueryData<MessagePages>(messageKeys.thread("c1", null));
    expect(getMessagePageMock).toHaveBeenCalledTimes(2);
    expect(cached?.pages[0]?.items[0]?.media?.url).toBe(
      "https://s3.test/note.m4a?X-Amz-Date=120000",
    );
    // Rien d'autre n'avait changé : le cache garde la même réponse, et rien ne se redessine.
    expect(cached).toBe(first);
  });

  it("rend le fil à plat, et charge la page d'avant par son curseur (#77)", async () => {
    getMessagePageMock
      .mockResolvedValueOnce({ items: [textMessage("m3"), textMessage("m4")], nextCursor: "c-m3" })
      .mockResolvedValueOnce({ items: [textMessage("m1"), textMessage("m2")], nextCursor: null });
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useThreadMessages("c1"), { wrapper });
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
   * Deux pages chargées, un message arrivé : la plus récente relue a perdu m3 par le bas. Relues
   * depuis SON curseur, les pages d'avant glissaient d'autant, et m1 — sous les yeux du lecteur
   * remonté — disparaissait. Elle garde sa frontière : la page d'avant se relit au même curseur.
   */
  it("relit chaque page au sondage sans faire glisser le fil chargé", async () => {
    getMessagePageMock
      .mockResolvedValueOnce({ items: [textMessage("m3"), textMessage("m4")], nextCursor: "c-m3" })
      .mockResolvedValueOnce({ items: [textMessage("m1"), textMessage("m2")], nextCursor: null });
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useThreadMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    await act(() => result.current.fetchNextPage());

    getMessagePageMock
      .mockResolvedValueOnce({ items: [textMessage("m4"), textMessage("m5")], nextCursor: "c-m4" })
      .mockResolvedValueOnce({ items: [textMessage("m1"), textMessage("m2")], nextCursor: null });
    await act(() => result.current.refetch());

    expect(getMessagePageMock.mock.calls.slice(2)).toEqual([
      ["c1", null, null],
      ["c1", "c-m3", null],
    ]);
    await waitFor(() =>
      expect(result.current.data?.map(({ id }) => id)).toEqual(["m1", "m2", "m3", "m4", "m5"]),
    );
  });
});

describe("useConversations", () => {
  // Le tableau de bord n'en tire qu'un compteur : il ne sonde pas toutes les 15 s pour autant.
  it("ne sonde pas quand l'appelant n'en tire qu'un compteur", async () => {
    const { wrapper, queryClient } = renderWithQueryClient();

    const { result } = renderHook(() => useConversations({ poll: false }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = queryClient.getQueryCache().find({ queryKey: messageKeys.conversations(null) });
    expect(query?.options).toMatchObject({ refetchInterval: false });
  });
});

describe("useConversationWith", () => {
  // Pas d'athlète désigné, pas de fil : le get-or-create ne part pas à vide.
  it("ne résout aucun fil sans athlète désigné", () => {
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useConversationWith(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(createConversationMock).not.toHaveBeenCalled();
  });
});

import type { MessageDto } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageKeys } from "@/feature/message/api";
import { renderWithQueryClient } from "../../../../test/query";
import { useThreadMessages } from "./useMessages";

const { getMessagesMock } = vi.hoisted(() => ({ getMessagesMock: vi.fn() }));

vi.mock("@/feature/message/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/message/api")>()),
  messageApi: { getMessages: getMessagesMock },
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
  readAt: null,
  createdAt: "2026-09-25T12:00:00.000Z",
});

beforeEach(() => {
  getMessagesMock.mockReset();
});

describe("useThreadMessages", () => {
  /**
   * #304 : le fil est sondé toutes les 10 s et chaque réponse re-signe les médias. Remettre la
   * nouvelle URL au `<audio>` relançait son chargement — la note vocale repartait de zéro.
   */
  it("garde l'URL du média d'une réponse à l'autre tant qu'elle est ouvrable", async () => {
    getMessagesMock.mockResolvedValueOnce([voiceNote("120000")]);
    const { queryClient, wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useThreadMessages("c1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;

    getMessagesMock.mockResolvedValueOnce([voiceNote("120010")]);
    await result.current.refetch();

    // Le CACHE, et non le rendu du hook : c'est lui que lisent toutes les surfaces, et il est à
    // jour dès que le rechargement rend la main — le rendu, lui, suit un tour plus tard.
    const cached = queryClient.getQueryData<MessageDto[]>(messageKeys.thread("c1", null));
    expect(getMessagesMock).toHaveBeenCalledTimes(2);
    expect(cached?.[0]?.media?.url).toBe("https://s3.test/note.m4a?X-Amz-Date=120000");
    // Rien d'autre n'avait changé : le cache garde la même réponse, et rien ne se redessine.
    expect(cached).toBe(first);
  });
});

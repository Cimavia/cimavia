import type { SessionFeedbackDto } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachFeedbackKeys, myFeedbackKeys } from "@/feature/feedback/api";
import { renderWithQueryClient } from "../../../../test/query";
import { useSessionFeedback } from "./useFeedbacks";
import { useMyFeedback } from "./useMyFeedback";

const { getMock, getBySessionMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  getBySessionMock: vi.fn(),
}));

vi.mock("@/feature/feedback/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/feedback/api")>()),
  athleteFeedbackApi: { get: getMock },
  coachFeedbackApi: { getBySession: getBySessionMock },
}));

vi.mock("@/shared/hook/useMutationToast", () => ({ useMutationToast: () => ({}) }));

const url = (key: string, signedAt: string) => `https://s3.test/${key}?X-Amz-Date=${signedAt}`;

/** Un débrief dont chaque média — le sien et celui de sa réponse — est signé à `signedAt`. */
const debrief = (signedAt: string): SessionFeedbackDto => ({
  id: "f1",
  scheduledSessionId: "s1",
  athleteId: "a1",
  content: null,
  coachReadAt: null,
  media: [
    {
      id: "fm-photo",
      type: "IMAGE",
      url: url("prise.jpg", signedAt),
      fileName: "prise.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      durationSeconds: null,
      createdAt: "2026-09-25T12:00:00.000Z",
    },
  ],
  trackedExercises: [],
  messages: [
    {
      id: "m-reply",
      conversationId: "c1",
      senderId: "coach",
      type: "AUDIO",
      content: null,
      media: {
        url: url("reponse.m4a", signedAt),
        fileName: "reponse.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 10,
        durationSeconds: 30,
      },
      scheduledSessionId: null,
      sessionFeedbackId: "f1",
      attachment: null,
      readAt: null,
      createdAt: "2026-09-25T12:00:00.000Z",
    },
  ],
  createdAt: "2026-09-25T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
});

beforeEach(() => {
  getMock.mockReset();
  getBySessionMock.mockReset();
});

/**
 * #304 : le débrief se recharge au retour sur l'onglet, au marquage lu, à l'envoi d'une réponse —
 * et chaque réponse re-signe les médias. Les deux surfaces, et les médias des RÉPONSES aussi.
 */
describe.each([
  {
    surface: "coach",
    hook: useSessionFeedback,
    fetch: getBySessionMock,
    key: coachFeedbackKeys.bySession("s1"),
  },
  { surface: "athlète", hook: useMyFeedback, fetch: getMock, key: myFeedbackKeys.detail("s1") },
])("débrief $surface", ({ hook, fetch, key }) => {
  it("garde les URLs des médias d'une réponse à l'autre tant qu'elles sont ouvrables", async () => {
    fetch.mockResolvedValueOnce(debrief("120000"));
    const { queryClient, wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => hook("s1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;

    fetch.mockResolvedValueOnce(debrief("120060"));
    await result.current.refetch();

    const cached = queryClient.getQueryData<SessionFeedbackDto>(key);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cached?.media[0]?.url).toBe(url("prise.jpg", "120000"));
    expect(cached?.messages[0]?.media?.url).toBe(url("reponse.m4a", "120000"));
    expect(cached).toBe(first);
  });
});

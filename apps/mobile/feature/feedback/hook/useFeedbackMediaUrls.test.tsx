import { coachFeedbackKeys, myFeedbackKeys, type SessionFeedbackDto } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useCoachFeedbackDetail } from "./useCoachFeedbacks";
import { useSessionFeedback } from "./useSessionFeedback";

const { getMock, getBySessionMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  getBySessionMock: vi.fn(),
}));

// Les clés restent les VRAIES : les inventer ferait vérifier au test une clé qu'il aurait choisie.
vi.mock("@/feature/feedback/api", async () => ({
  athleteFeedbackApi: { get: getMock },
  coachFeedbackApi: { getBySession: getBySessionMock },
  myFeedbackKeys: (await import("@cmv/shared")).myFeedbackKeys,
  coachFeedbackKeys: (await import("@cmv/shared")).coachFeedbackKeys,
}));

vi.mock("@/feature/plan/api", async () => ({
  myPlanKeys: (await import("@cmv/shared")).myPlanKeys,
}));

const T0 = Date.UTC(2026, 8, 25, 12, 0, 0);
const url = (key: string, signedAt: number) => `https://s3.test/${key}?X-Amz-Date=${signedAt}`;

/**
 * La table des URLs est UNE pour toute l'app — c'est son rôle —, donc une pour ce fichier : les
 * ids de médias changent à chaque test, sans quoi l'un hériterait des URLs gardées du précédent.
 */
let run = 0;
const videoId = () => `fm-video-${run}`;
const replyId = () => `m-reply-${run}`;

/** Un débrief dont chaque média — le sien et celui de sa réponse — est signé à `signedAt`. */
const debrief = (signedAt: number): SessionFeedbackDto => ({
  id: "f1",
  scheduledSessionId: "s1",
  athleteId: "a1",
  content: null,
  coachReadAt: null,
  media: [
    {
      id: videoId(),
      type: "VIDEO",
      url: url("voie.mp4", signedAt),
      fileName: "voie.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10,
      durationSeconds: 40,
      createdAt: "2026-09-25T12:00:00.000Z",
    },
  ],
  trackedExercises: [],
  messages: [
    {
      id: replyId(),
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

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// Seule l'horloge est simulée : TanStack garde ses vrais minuteurs.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  run += 1;
  getMock.mockReset();
  getBySessionMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * #304 : le débrief se recharge au retour au premier plan et à chaque réponse envoyée — et chaque
 * réponse re-signe les médias. `CmvAudioPlayer` recrée alors son lecteur, la note repart de zéro.
 */
describe.each([
  {
    surface: "coach",
    hook: useCoachFeedbackDetail,
    fetch: getBySessionMock,
    key: coachFeedbackKeys.bySession("s1"),
  },
  {
    surface: "athlète",
    hook: useSessionFeedback,
    fetch: getMock,
    key: myFeedbackKeys.detail("s1"),
  },
])("débrief $surface", ({ hook, fetch, key }) => {
  it("garde les URLs des médias d'une réponse à l'autre tant qu'elles sont ouvrables", async () => {
    fetch.mockResolvedValueOnce(debrief(0));
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => hook("s1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;

    vi.setSystemTime(T0 + 60_000);
    fetch.mockResolvedValueOnce(debrief(60));
    await result.current.refetch();

    const cached = queryClient.getQueryData<SessionFeedbackDto>(key);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cached?.media[0]?.url).toBe(url("voie.mp4", 0));
    expect(cached?.messages[0]?.media?.url).toBe(url("reponse.m4a", 0));
    // Rien d'autre n'avait changé : le cache garde la même réponse, et rien ne se redessine.
    expect(cached).toBe(first);
  });
});

describe("useFreshMediaUrl", () => {
  /**
   * Le piège de l'issue. L'URL a été reçue à T0 et GARDÉE par un rechargement à T0+4 min : la
   * requête a l'air fraîche, l'URL a six minutes au moment d'ouvrir. L'ancien test — l'âge de la
   * REQUÊTE — l'aurait ouverte telle quelle, droit sur le 403 du storage.
   */
  it("re-signe une URL gardée trop vieille, même quand la requête est récente", async () => {
    getBySessionMock.mockResolvedValueOnce(debrief(0));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        feedback: useCoachFeedbackDetail("s1"),
        fresh: useFreshMediaUrl(coachFeedbackKeys.bySession("s1")),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.feedback.data).toBeDefined());

    vi.setSystemTime(T0 + 4 * 60_000);
    getBySessionMock.mockResolvedValueOnce(debrief(240));
    await result.current.feedback.refetch();

    vi.setSystemTime(T0 + 6 * 60_000);
    getBySessionMock.mockResolvedValueOnce(debrief(360));

    await expect(result.current.fresh(videoId())).resolves.toBe(url("voie.mp4", 360));
    expect(getBySessionMock).toHaveBeenCalledTimes(3);
  });

  it("rend l'URL gardée sans recharger tant qu'elle est ouvrable", async () => {
    getBySessionMock.mockResolvedValueOnce(debrief(0));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        feedback: useCoachFeedbackDetail("s1"),
        fresh: useFreshMediaUrl(coachFeedbackKeys.bySession("s1")),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.feedback.data).toBeDefined());

    vi.setSystemTime(T0 + 60_000);

    await expect(result.current.fresh(replyId())).resolves.toBe(url("reponse.m4a", 0));
    expect(getBySessionMock).toHaveBeenCalledOnce();
  });

  // Rechargement raté (hors réseau) : la table n'a pas bougé, on refuse d'ouvrir.
  it("rend null quand la re-signature échoue", async () => {
    getBySessionMock.mockResolvedValueOnce(debrief(0));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        feedback: useCoachFeedbackDetail("s1"),
        fresh: useFreshMediaUrl(coachFeedbackKeys.bySession("s1")),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.feedback.data).toBeDefined());

    vi.setSystemTime(T0 + 6 * 60_000);
    getBySessionMock.mockRejectedValueOnce(new Error("hors réseau"));

    await expect(result.current.fresh(videoId())).resolves.toBeNull();
  });
});

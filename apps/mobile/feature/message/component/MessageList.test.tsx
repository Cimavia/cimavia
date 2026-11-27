import type { ConversationDto, MessageDto, VoiceNoteCue } from "@cmv/shared";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "@/feature/message/component/MessageList";
import type { OlderMessages } from "@/feature/message/hook/useOlderMessages";
import { pressButton, renderRn } from "@/test/render";

/**
 * Le lecteur a ses propres tests : ce que le fil décide est QUELLE note suit celle qui finit. Le
 * double garde ce que le fil lui dit pour l'enchaîner (#529), par URL.
 */
const { cues } = vi.hoisted(() => ({ cues: new Map<string, VoiceNoteCue | undefined>() }));
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CmvAudioPlayer: ({ url, cue }: Readonly<{ url: string; cue?: VoiceNoteCue }>) => {
    cues.set(url, cue);
    return null;
  },
}));

const url = (id: string) => `https://storage.test/${id}`;

function message(id: string, type: "AUDIO" | "TEXT"): MessageDto {
  return {
    id,
    senderId: "athlete-1",
    type,
    content: type === "TEXT" ? "bien joué" : null,
    media: type === "AUDIO" ? { url: url(id), durationSeconds: 5 } : null,
    attachment: null,
    createdAt: "2026-10-16T19:42:00.000Z",
  } as MessageDto;
}

// La fin d'une note, telle que son lecteur l'annonce au fil.
const finish = (id: string) => act(() => cues.get(url(id))?.onFinish());

const DIRECT = {
  id: "cv-1",
  kind: "DIRECT",
  participants: [{ userId: "athlete-1", name: "Léa", capability: "athlete", lastReadAt: null }],
} as ConversationDto;

const IDLE: OlderMessages = { loading: false, failed: false, loadMore: vi.fn(), retry: vi.fn() };

function renderThread(messages: MessageDto[], older: OlderMessages = IDLE) {
  return renderRn(
    <MessageList
      conversation={DIRECT}
      messages={messages}
      currentUserId="coach-1"
      readBy={null}
      resolveMediaUrl={vi.fn()}
      older={older}
    />,
  );
}

beforeEach(() => {
  cues.clear();
});

describe("MessageList — les notes vocales s'enchaînent (#529)", () => {
  /**
   * Le fil s'affiche inversé (le plus récent en bas) : la suite d'une note est le message PLUS
   * RÉCENT, pas celui qui la suit dans les données affichées.
   */
  it("passe à la note suivante dans l'ordre du fil", () => {
    renderThread([message("v-1", "AUDIO"), message("v-2", "AUDIO")]);

    finish("v-1");

    expect(cues.get(url("v-2"))?.cued).toBe(true);
  });

  it("s'arrête sur un message qui n'est pas une note", () => {
    renderThread([message("v-1", "AUDIO"), message("t-2", "TEXT"), message("v-3", "AUDIO")]);

    finish("v-1");

    expect(cues.get(url("v-3"))?.cued).toBe(false);
  });
});

/**
 * La tête du fil (#77), en pied de la liste inversée. L'arrivée en tête elle-même (`onEndReached`)
 * demande une vraie mise en page, que jsdom n'a pas : elle s'éprouve sur l'émulateur, et ce qu'elle
 * déclenche dans `useOlderMessages`.
 */
describe("MessageList — messages précédents (#77)", () => {
  it("ne dit rien tant que la remontée se passe bien", () => {
    const { queryByText, queryByRole } = renderThread([message("t-1", "TEXT")]);

    expect(queryByText("messages.older.loading")).toBeNull();
    expect(queryByText("messages.older.error")).toBeNull();
    expect(queryByRole("button", { name: "common.retry" })).toBeNull();
  });

  it("dit que la page d'avant arrive", () => {
    const { getByText } = renderThread([message("t-1", "TEXT")], { ...IDLE, loading: true });

    expect(getByText("messages.older.loading")).toBeTruthy();
  });

  it("dit l'échec, et relance sur « Réessayer »", () => {
    const retry = vi.fn();
    const { container, getByText } = renderThread([message("t-1", "TEXT")], {
      ...IDLE,
      failed: true,
      retry,
    });

    expect(getByText("messages.older.error")).toBeTruthy();
    pressButton(container, "common.retry");
    expect(retry).toHaveBeenCalledOnce();
  });
});

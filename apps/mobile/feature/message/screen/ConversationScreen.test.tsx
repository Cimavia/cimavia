import type { CoachAthleteDto, ConversationDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi } from "@/feature/coach/api";
import { messageApi } from "@/feature/message/api";
import { ConversationScreen } from "@/feature/message/screen/ConversationScreen";
import { notificationApi } from "@/feature/notification/api";
import { ApiError } from "@/shared/lib/api";
import { press, renderRn } from "@/test/render";

/**
 * Ce que l'écran DÉCIDE : ouvrir le fil seulement quand l'athlète a un coach, et transmettre au
 * fil ce qu'il sait de sa résolution. Le rendu du fil a ses propres tests : on le double pour lire
 * ce qu'il reçoit. Les hooks, eux, sont les VRAIS — seuls les appels sont remplacés.
 */
vi.mock("@/feature/message/component/ConversationThread", () => ({
  ConversationThread: (
    props: Readonly<{
      conversationId?: string;
      isResolving: boolean;
      hasResolveError: boolean;
      onRetryResolve: () => void;
      header?: ReactNode;
    }>,
  ) => (
    <div
      data-thread={props.conversationId ?? "none"}
      data-resolving={String(props.isResolving)}
      data-error={String(props.hasResolveError)}
    >
      <button type="button" onClick={props.onRetryResolve}>
        retry
      </button>
      {props.header}
    </div>
  ),
}));
vi.mock("@/shared/component", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/component")>();
  return {
    ...original,
    CmvCapabilitySwitch: ({ unread }: Readonly<{ unread?: { count: number } }>) => (
      <span data-switch={unread?.count ?? "none"} />
    ),
  };
});
vi.mock("@/feature/coach/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/coach/api")>();
  return { ...original, accountApi: { ...original.accountApi, myCoach: vi.fn() } };
});
vi.mock("@/feature/message/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/message/api")>();
  return { ...original, messageApi: { ...original.messageApi, openConversation: vi.fn() } };
});
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/notification/api")>();
  return {
    ...original,
    notificationApi: { ...original.notificationApi, unreadCount: vi.fn() },
  };
});

const myCoach = vi.mocked(accountApi.myCoach);
const openConversation = vi.mocked(messageApi.openConversation);

const COACH = { id: "rel-1", coachId: "coach-1", coachName: "Kylian" } as CoachAthleteDto;
const CONVERSATION = { id: "conv-1" } as ConversationDto;

const thread = (container: HTMLElement) => container.querySelector("[data-thread]");

beforeEach(() => {
  myCoach.mockResolvedValue(COACH);
  openConversation.mockResolvedValue(CONVERSATION);
  vi.mocked(notificationApi.unreadCount).mockResolvedValue({ count: 2, coach: 0, athlete: 2 });
});

describe("ConversationScreen", () => {
  /** Sans coach, l'API refuserait (400) : on le dit, et on n'ouvre rien. */
  it("dit l'absence de coach sans ouvrir de fil", async () => {
    myCoach.mockResolvedValue(null);
    const { findByText, container } = renderRn(<ConversationScreen />);

    expect(await findByText("messages.noCoach.title")).toBeTruthy();
    expect(thread(container)).toBeNull();
    expect(openConversation).not.toHaveBeenCalled();
  });

  /** Double capacité basculée côté athlète : le sélecteur reste là, sans quoi il serait coincé. */
  it.each([
    ["sans coach", null],
    ["dans le fil", COACH],
  ])("garde le sélecteur d'espace %s, compteur compris", async (_, coach) => {
    myCoach.mockResolvedValue(coach);
    const { container } = renderRn(<ConversationScreen />);

    await waitFor(() =>
      expect(container.querySelector("[data-switch]")?.getAttribute("data-switch")).toBe("2"),
    );
  });

  it("ouvre le fil de l'athlète avec son coach, à son titre d'athlète", async () => {
    const { container } = renderRn(<ConversationScreen />);

    await waitFor(() => expect(thread(container)?.getAttribute("data-thread")).toBe("conv-1"));
    expect(openConversation).toHaveBeenCalledWith({}, "athlete");
    expect(thread(container)?.getAttribute("data-resolving")).toBe("false");
  });

  it("dit au fil qu'il se résout encore", async () => {
    openConversation.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<ConversationScreen />);

    await waitFor(() => expect(thread(container)?.getAttribute("data-resolving")).toBe("true"));
    expect(thread(container)?.getAttribute("data-thread")).toBe("none");
  });

  it("dit au fil que sa résolution a échoué, et la rejoue à sa demande", async () => {
    openConversation.mockRejectedValue(new ApiError(500, "boom", null));
    const { container, getByText } = renderRn(<ConversationScreen />);
    await waitFor(() => expect(thread(container)?.getAttribute("data-error")).toBe("true"));

    openConversation.mockResolvedValue(CONVERSATION);
    press(getByText("retry"));

    await waitFor(() => expect(thread(container)?.getAttribute("data-thread")).toBe("conv-1"));
  });
});

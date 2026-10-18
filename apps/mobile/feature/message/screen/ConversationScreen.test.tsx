import type { ConversationDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversation } from "@/feature/message/hook/useConversation";
import { ConversationScreen } from "@/feature/message/screen/ConversationScreen";
import { pressButton, renderRn } from "@/test/render";

/**
 * Le fil a ses propres tests : ici, ce que l'écran décide AVANT lui — attendre, dire la panne, ou
 * relire la liste une fois quand la conversation n'y est pas encore.
 */
vi.mock("@/feature/message/hook/useConversation", () => ({ useConversation: vi.fn() }));
vi.mock("@/feature/message/component/ConversationThread", () => ({
  ConversationThread: ({ conversation }: Readonly<{ conversation: ConversationDto }>) => (
    <span data-thread={conversation.id} />
  ),
  ThreadHeader: () => <span data-header />,
}));

const refetch = vi.fn(() => Promise.resolve());

function mockConversation(
  conversation: ConversationDto | null | undefined,
  state: Record<string, unknown> = {},
): void {
  vi.mocked(useConversation).mockReturnValue({
    conversation,
    conversations: { isError: false, isFetching: false, refetch, ...state },
  } as unknown as ReturnType<typeof useConversation>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLocalSearchParams).mockReturnValue({ conversationId: "cv-1" });
});

describe("ConversationScreen (#612)", () => {
  it("ouvre la conversation désignée par l'url", () => {
    mockConversation({ id: "cv-1" } as ConversationDto);
    const { container } = renderRn(<ConversationScreen />);

    expect(useConversation).toHaveBeenCalledWith("cv-1");
    expect(container.querySelector("[data-thread]")?.getAttribute("data-thread")).toBe("cv-1");
    expect(refetch).not.toHaveBeenCalled();
  });

  it("attend la liste sans rien dire", () => {
    mockConversation(undefined);
    const { container, queryByText } = renderRn(<ConversationScreen />);

    expect(container.querySelector("[data-header]")).not.toBeNull();
    expect(queryByText("common.retry")).toBeNull();
  });

  // Ouverte par un autre participant depuis le dernier passage : la liste ne la porte pas encore.
  // La panne ne se dit pas avant la fin de la relecture — elle clignoterait.
  it("relit la liste une fois quand la conversation n'y est pas, et attend", () => {
    refetch.mockReturnValueOnce(new Promise(() => {}));
    mockConversation(null);
    const { queryByText } = renderRn(<ConversationScreen />);

    expect(refetch).toHaveBeenCalledOnce();
    expect(queryByText("common.retry")).toBeNull();
  });

  // Toujours absente : un fil vide inviterait à écrire dans une conversation qu'on n'a pas.
  it("dit la panne quand la liste relue ne la porte toujours pas", async () => {
    mockConversation(null);
    const { container, queryByText } = renderRn(<ConversationScreen />);

    await waitFor(() => expect(queryByText("common.retry")).not.toBeNull());
    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("dit la panne quand la liste ne se charge pas", () => {
    mockConversation(undefined, { isError: true });
    const { queryByText } = renderRn(<ConversationScreen />);

    expect(queryByText("common.retry")).not.toBeNull();
  });
});

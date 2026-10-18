import type { ConversationDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageApi } from "@/feature/message/api";
import { CounterpartConversationScreen } from "@/feature/message/screen/CounterpartConversationScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { ApiError } from "@/shared/lib/api";
import { press, renderRn } from "@/test/render";

// Le rendu du fil a ses propres tests : on le double pour lire ce qu'il reçoit. Le hook de
// résolution est le VRAI — seul l'appel est remplacé.
vi.mock("@/feature/message/component/ConversationThread", () => ({
  ConversationThread: (
    props: Readonly<{
      conversationId?: string;
      lastReadAt: string | null;
      isResolving: boolean;
      hasResolveError: boolean;
      onRetryResolve: () => void;
    }>,
  ) => (
    <button
      type="button"
      data-thread={props.conversationId ?? "none"}
      data-last-read={props.lastReadAt ?? "never"}
      data-resolving={String(props.isResolving)}
      data-error={String(props.hasResolveError)}
      onClick={props.onRetryResolve}
    />
  ),
}));
vi.mock("@/feature/message/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/message/api")>();
  return {
    ...original,
    messageApi: { ...original.messageApi, createConversation: vi.fn(), listConversations: vi.fn() },
  };
});

vi.mock("@/shared/hook/useExercisedCapability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/hook/useExercisedCapability")>()),
  useActingCapability: vi.fn(),
}));

const createConversation = vi.mocked(messageApi.createConversation);
const listConversations = vi.mocked(messageApi.listConversations);

const thread = (container: HTMLElement) => container.querySelector("[data-thread]") as HTMLElement;

beforeEach(() => {
  vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: "ath-1" });
  vi.mocked(useActingCapability).mockReturnValue("coach");
  createConversation.mockResolvedValue({ id: "conv-1", lastReadAt: null } as ConversationDto);
  listConversations.mockResolvedValue([]);
});

describe("CounterpartConversationScreen", () => {
  it("ouvre le fil avec l'athlète désigné par l'url, à son titre de coach", async () => {
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
    expect(createConversation).toHaveBeenCalledOnce();
    expect(createConversation).toHaveBeenCalledWith(
      { participants: [{ userId: "ath-1", capability: "athlete" }] },
      "coach",
    );
  });

  /** Un get-or-create sans cible créerait un fil au hasard : rien ne part sans athlète désigné. */
  it("n'ouvre rien tant qu'aucun athlète n'est désigné", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: null } as never);
    const { container } = renderRn(<CounterpartConversationScreen />);

    expect(thread(container).getAttribute("data-thread")).toBe("none");
    expect(createConversation).not.toHaveBeenCalled();
  });

  // #599 : l'athlète a un fil par coach, et c'est l'url qui désigne lequel — à son titre d'athlète.
  it("ouvre le fil avec le coach désigné par l'url, à son titre d'athlète", async () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: "coa-2" });
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
    expect(createConversation).toHaveBeenCalledOnce();
    expect(createConversation).toHaveBeenCalledWith(
      { participants: [{ userId: "coa-2", capability: "coach" }] },
      "athlete",
    );
  });

  it("rejoue la résolution après un échec", async () => {
    createConversation.mockRejectedValue(new ApiError(500, "boom", null));
    const { container } = renderRn(<CounterpartConversationScreen />);
    await waitFor(() => expect(thread(container).getAttribute("data-error")).toBe("true"));

    createConversation.mockResolvedValue({ id: "conv-1", lastReadAt: null } as ConversationDto);
    press(thread(container));

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
  });

  /**
   * Ma marque de lecture se lit dans la liste, que `markRead` invalide (#611) : le fil résolu est
   * figé, et sa marque aurait l'âge de l'ouverture.
   */
  it("transmet la marque de lecture de la liste plutôt que celle de la résolution", async () => {
    createConversation.mockResolvedValue({
      id: "conv-1",
      lastReadAt: "2026-10-01T08:00:00.000Z",
    } as ConversationDto);
    listConversations.mockResolvedValue([
      { id: "conv-1", lastReadAt: "2026-10-02T08:00:00.000Z" } as ConversationDto,
    ]);
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() =>
      expect(thread(container).getAttribute("data-last-read")).toBe("2026-10-02T08:00:00.000Z"),
    );
  });

  it("garde la marque lue à la résolution tant que la liste ne porte pas le fil", async () => {
    createConversation.mockResolvedValue({
      id: "conv-1",
      lastReadAt: "2026-10-01T08:00:00.000Z",
    } as ConversationDto);
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() =>
      expect(thread(container).getAttribute("data-last-read")).toBe("2026-10-01T08:00:00.000Z"),
    );
  });
});

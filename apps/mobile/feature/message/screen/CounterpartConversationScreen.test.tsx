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
      isResolving: boolean;
      hasResolveError: boolean;
      onRetryResolve: () => void;
    }>,
  ) => (
    <button
      type="button"
      data-thread={props.conversationId ?? "none"}
      data-resolving={String(props.isResolving)}
      data-error={String(props.hasResolveError)}
      onClick={props.onRetryResolve}
    />
  ),
}));
vi.mock("@/feature/message/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/message/api")>();
  return { ...original, messageApi: { ...original.messageApi, openConversation: vi.fn() } };
});

vi.mock("@/shared/hook/useExercisedCapability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/hook/useExercisedCapability")>()),
  useActingCapability: vi.fn(),
}));

const openConversation = vi.mocked(messageApi.openConversation);

const thread = (container: HTMLElement) => container.querySelector("[data-thread]") as HTMLElement;

beforeEach(() => {
  vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: "ath-1" });
  vi.mocked(useActingCapability).mockReturnValue("coach");
  openConversation.mockResolvedValue({ id: "conv-1" } as ConversationDto);
});

describe("CounterpartConversationScreen", () => {
  it("ouvre le fil avec l'athlète désigné par l'url, à son titre de coach", async () => {
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
    expect(openConversation).toHaveBeenCalledOnce();
    expect(openConversation).toHaveBeenCalledWith({ athleteId: "ath-1" }, "coach");
  });

  /** Un get-or-create sans cible créerait un fil au hasard : rien ne part sans athlète désigné. */
  it("n'ouvre rien tant qu'aucun athlète n'est désigné", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: null } as never);
    const { container } = renderRn(<CounterpartConversationScreen />);

    expect(thread(container).getAttribute("data-thread")).toBe("none");
    expect(openConversation).not.toHaveBeenCalled();
  });

  // #599 : l'athlète a un fil par coach, et c'est l'url qui désigne lequel — à son titre d'athlète.
  it("ouvre le fil avec le coach désigné par l'url, à son titre d'athlète", async () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    vi.mocked(useLocalSearchParams).mockReturnValue({ counterpartId: "coa-2" });
    const { container } = renderRn(<CounterpartConversationScreen />);

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
    expect(openConversation).toHaveBeenCalledOnce();
    expect(openConversation).toHaveBeenCalledWith({ coachId: "coa-2" }, "athlete");
  });

  it("rejoue la résolution après un échec", async () => {
    openConversation.mockRejectedValue(new ApiError(500, "boom", null));
    const { container } = renderRn(<CounterpartConversationScreen />);
    await waitFor(() => expect(thread(container).getAttribute("data-error")).toBe("true"));

    openConversation.mockResolvedValue({ id: "conv-1" } as ConversationDto);
    press(thread(container));

    await waitFor(() => expect(thread(container).getAttribute("data-thread")).toBe("conv-1"));
  });
});

import { describe, expect, it, vi } from "vitest";
import { MessagesScreen } from "@/feature/message/screen/MessagesScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { renderRn } from "@/test/render";

// Chaque écran a ses propres tests : ici, on vérifie seulement lequel des deux est monté — l'autre
// ferait partir une requête que ce titre n'a pas le droit de lire (403).
vi.mock("@/feature/message/screen/ConversationsScreen", () => ({
  CoachConversationsScreen: () => <span data-screen="coach" />,
  AthleteConversationsScreen: () => <span data-screen="athlete" />,
}));
vi.mock("@/shared/hook/useExercisedCapability", () => ({ useActingCapability: vi.fn() }));

describe("MessagesScreen", () => {
  it.each([
    ["la liste des fils au titre de coach", "coach"],
    ["la liste des fils au titre d'athlète", "athlete"],
  ] as const)("monte %s", (_, capability) => {
    vi.mocked(useActingCapability).mockReturnValue(capability);
    const { container } = renderRn(<MessagesScreen />);

    expect(container.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe(capability);
  });
});

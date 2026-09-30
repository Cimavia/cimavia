import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { authClient } from "@/shared/lib/auth";
import { useAthleteLabel } from "./useAthleteLabel";

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));
// Le libellé traduit est remplacé par sa clé et son paramètre, que `cimode` perdrait.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name: string }) => `${key}(${options?.name ?? ""})`,
  }),
}));

function signedInAs(id: string | null) {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: id == null ? null : { user: { id } },
  } as unknown as ReturnType<typeof authClient.useSession>);
  return renderHook(() => useAthleteLabel()).result.current;
}

describe("useAthleteLabel", () => {
  it("marque le compte courant quand il se coache lui-même (#14)", () => {
    expect(signedInAs("me")("me", "Dual Curl")).toBe("athlete.self(Dual Curl)");
  });

  it("rend le nom brut d'un autre athlète", () => {
    expect(signedInAs("me")("a-1", "Léa Moreau")).toBe("Léa Moreau");
  });

  /** Session non résolue : on ne prétend pas que c'est soi. */
  it("ne marque personne tant que la session n'est pas connue", () => {
    expect(signedInAs(null)("me", "Dual Curl")).toBe("Dual Curl");
  });
});

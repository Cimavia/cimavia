import { type CapabilityName, Role } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/shared/lib/auth";
import {
  ExercisedCapabilityProvider,
  useActingCapability,
  useCapabilitySwitch,
  useExercisedCapability,
} from "./useExercisedCapability";

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));

type Account = { isCoach: boolean; isAthlete: boolean; role: Role };

const COACH: Account = { isCoach: true, isAthlete: false, role: Role.COACH };
const ATHLETE: Account = { isCoach: false, isAthlete: true, role: Role.ATHLETE };
const DUAL_COACH: Account = { isCoach: true, isAthlete: true, role: Role.COACH };
const DUAL_ATHLETE: Account = { isCoach: true, isAthlete: true, role: Role.ATHLETE };

function signIn(account: Account | null): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: account == null ? null : { user: { id: "me", ...account } },
  } as unknown as ReturnType<typeof authClient.useSession>);
}

/** Le fournisseur est posé à la racine (`app/_layout.tsx`) : tous les cas le montent aussi. */
function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <ExercisedCapabilityProvider>{children}</ExercisedCapabilityProvider>;
}

beforeEach(() => {
  signIn(null);
});

describe("useExercisedCapability", () => {
  /**
   * `null` et non la capacité possédée : c'est ce qui laisse l'URL de l'API nue pour un compte qui
   * n'a qu'une réponse possible (`?as=` absent), comme avant #12.
   */
  it.each([
    ["coach seul", COACH],
    ["athlète seul", ATHLETE],
    ["sans session", null],
  ])("rend null pour un compte %s", (_, account) => {
    signIn(account);

    expect(renderHook(() => useExercisedCapability(), { wrapper }).result.current).toBeNull();
  });

  it.each<[string, Account, CapabilityName]>([
    ["coach", DUAL_COACH, "coach"],
    ["athlète", DUAL_ATHLETE, "athlete"],
  ])("atterrit sur le persona d'un compte double de persona %s", (_, account, expected) => {
    signIn(account);

    expect(renderHook(() => useExercisedCapability(), { wrapper }).result.current).toBe(expected);
  });
});

describe("useCapabilitySwitch", () => {
  it("ne propose aucun choix à un compte mono-capacité", () => {
    signIn(COACH);

    const { result } = renderHook(() => useCapabilitySwitch(), { wrapper });

    expect(result.current.visible).toBe(false);
    expect(result.current.current).toBeNull();
  });

  /**
   * Le choix l'emporte sur le persona, et il est PARTAGÉ : c'est le même contexte que lisent les
   * hooks de données, qui construisent leur requête et leur clé de cache sur ce titre.
   */
  it("fait primer le choix sur le persona, pour tous les lecteurs du contexte", () => {
    signIn(DUAL_COACH);

    const { result } = renderHook(
      () => ({ switcher: useCapabilitySwitch(), exercised: useExercisedCapability() }),
      { wrapper },
    );
    expect(result.current.switcher.visible).toBe(true);
    expect(result.current.exercised).toBe("coach");

    act(() => result.current.switcher.select("athlete"));

    expect(result.current.switcher.current).toBe("athlete");
    expect(result.current.exercised).toBe("athlete");
  });
});

describe("useActingCapability", () => {
  it.each<[string, Account | null, CapabilityName]>([
    ["un coach seul", COACH, "coach"],
    ["un athlète seul", ATHLETE, "athlete"],
    // Sans capacité connue, rien ne s'ouvre au titre de coach : l'écran montre le versant athlète,
    // qui n'offre aucune action de coach (« marquer payée »).
    ["un compte sans session", null, "athlete"],
  ])("rend la capacité possédée pour %s", (_, account, expected) => {
    signIn(account);

    expect(renderHook(() => useActingCapability(), { wrapper }).result.current).toBe(expected);
  });

  /**
   * Le cas qui justifie le hook : un compte double qui lit « en tant qu'athlète » ne doit pas voir
   * le versant coach, alors que sa capacité POSSÉDÉE dirait oui aux deux.
   */
  it("rend le titre choisi pour un compte double", () => {
    signIn(DUAL_COACH);

    const { result } = renderHook(
      () => ({ switcher: useCapabilitySwitch(), acting: useActingCapability() }),
      { wrapper },
    );
    act(() => result.current.switcher.select("athlete"));

    expect(result.current.acting).toBe("athlete");
  });
});

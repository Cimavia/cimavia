import { Role } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExercisedCapabilityProvider } from "@/shared/hook/useExercisedCapability";
import { authClient } from "@/shared/lib/auth";
import { press, renderRn } from "@/test/render";
import { CmvCapabilitySwitch } from "./CmvCapabilitySwitch";

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));

function signIn(isAthlete: boolean): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { id: "me", isCoach: true, isAthlete, role: Role.COACH } },
  } as unknown as ReturnType<typeof authClient.useSession>);
}

function setup(unread?: { coach: number; athlete: number }) {
  return renderRn(
    <ExercisedCapabilityProvider>
      <CmvCapabilitySwitch unread={unread} />
    </ExercisedCapabilityProvider>,
  );
}

function tab(container: HTMLElement, label: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (element) => element.textContent === label,
  );
  if (found == null) throw new Error(`onglet ${label} introuvable`);
  return found;
}

/** Les onglets qui portent la pastille « du nouveau de l'autre côté ». */
const dottedTabs = (container: HTMLElement) =>
  [...container.querySelectorAll('[aria-label="nav.spaceUnread"]')].map(
    (dot) => dot.closest('[role="tab"]')?.textContent,
  );

beforeEach(() => {
  signIn(true);
});

describe("CmvCapabilitySwitch", () => {
  /** Un sélecteur à une seule option ne dirait rien et prendrait une place. */
  it("ne rend rien pour un compte qui ne cumule pas", () => {
    signIn(false);

    const { container } = setup();

    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  /**
   * `accessibilityState` ne descend pas dans le DOM de react-native-web : l'espace sélectionné se
   * lit à la pastille, qui ne se pose QUE sur l'espace inactif (#176) — sur celui qu'on regarde,
   * le badge d'onglet dit déjà ce qui arrive.
   */
  it("part du persona, puis bascule sur l'espace pressé", () => {
    const { container } = setup({ coach: 2, athlete: 3 });
    expect(dottedTabs(container)).toEqual(["nav.space.athlete"]);

    press(tab(container, "nav.space.athlete"));

    expect(dottedTabs(container)).toEqual(["nav.space.coach"]);
  });

  it.each([
    ["rien n'attend", { coach: 0, athlete: 0 }],
    ["les compteurs ne sont pas chargés", undefined],
  ])("ne pose aucune pastille quand %s", (_, unread) => {
    const { container } = setup(unread);

    expect(dottedTabs(container)).toEqual([]);
  });
});

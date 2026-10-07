import { type CapabilityName, Role } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../test/render";
import { useActingCapability, useActiveSpace, useExercisedCapability } from "./useCapabilities";

type SessionUser = { isCoach: boolean; isAthlete: boolean; isCompany?: boolean; role: Role };

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user }, isPending: false }) },
}));

const DUAL: SessionUser = { isCoach: true, isAthlete: true, role: Role.COACH };
const COACH_ONLY: SessionUser = { isCoach: true, isAthlete: false, role: Role.COACH };
const ATHLETE_ONLY: SessionUser = { isCoach: false, isAthlete: true, role: Role.ATHLETE };

/**
 * Chaque hook est lu SEUL : `useActiveSpace` sur `?as=` hors capacité est le bug #371, et un
 * test qui l'afficherait à côté d'un autre le figerait sans le dire.
 */
function probe(hook: () => CapabilityName | null) {
  return function Probe() {
    return <span data-testid="capability">{hook() ?? "null"}</span>;
  };
}

async function read(
  hook: () => CapabilityName | null,
  path: string,
  search: Record<string, string> = {},
) {
  const Probe = probe(hook);
  const { getByTestId, unmount } = await renderInRoute(<Probe />, { path, search });
  const value = getByTestId("capability").textContent;
  unmount();
  return value;
}

beforeEach(() => {
  session.user = DUAL;
});

describe("useActiveSpace — un compte à double capacité", () => {
  it("se range dans l'espace que le chemin désigne", async () => {
    expect(await read(useActiveSpace, "/library")).toBe("coach");
    expect(await read(useActiveSpace, "/planning")).toBe("athlete");
  });

  it("laisse ?as= trancher sur une route servie aux deux", async () => {
    expect(await read(useActiveSpace, "/invoices", { as: "athlete" })).toBe("athlete");
  });

  it("retombe sur le persona quand ni le chemin ni ?as= ne disent rien", async () => {
    session.user = { ...DUAL, role: Role.ATHLETE };
    expect(await read(useActiveSpace, "/invoices")).toBe("athlete");

    session.user = DUAL;
    expect(await read(useActiveSpace, "/invoices")).toBe("coach");
  });
});

describe("useActiveSpace — un compte Entreprise (#600)", () => {
  const COMPANY: SessionUser = {
    isCoach: false,
    isAthlete: false,
    isCompany: true,
    role: Role.COMPANY,
  };

  it("se range dans son espace hors de ses pages, plutôt que dans celui du coach", async () => {
    session.user = COMPANY;

    expect(await read(useActiveSpace, "/account")).toBe("company");
  });

  it("n'a aucun titre à préciser, même sur son espace", async () => {
    session.user = COMPANY;

    expect(await read(useExercisedCapability, "/company/coaches")).toBe("null");
  });
});

describe("useExercisedCapability", () => {
  it("rend le titre d'un compte à double capacité", async () => {
    expect(await read(useExercisedCapability, "/invoices", { as: "athlete" })).toBe("athlete");
  });

  it.each([
    ["coach", COACH_ONLY],
    ["athlète", ATHLETE_ONLY],
  ])("rend null pour un compte %s seul, chez qui la question ne se pose pas", async (_, user) => {
    session.user = user;

    expect(await read(useExercisedCapability, "/invoices")).toBe("null");
  });
});

describe("useActingCapability", () => {
  it("donne l'espace courant à un compte à double capacité", async () => {
    expect(await read(useActingCapability, "/invoices", { as: "athlete" })).toBe("athlete");
    expect(await read(useActingCapability, "/invoices", { as: "coach" })).toBe("coach");
  });

  // Le cas que le commentaire du hook nomme : sans la borne, le repli du persona l'emporterait.
  it("borne un compte mono-capacité à la seule qu'il a, quelle que soit l'URL", async () => {
    session.user = { ...ATHLETE_ONLY, role: Role.COACH };
    expect(await read(useActingCapability, "/invoices")).toBe("athlete");

    session.user = COACH_ONLY;
    expect(await read(useActingCapability, "/invoices", { as: "athlete" })).toBe("coach");
  });
});

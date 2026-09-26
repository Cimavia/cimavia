import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../test/render";
import { CmvRoleGate } from "./CmvRoleGate";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => useSessionMock() },
}));

type Session = { isCoach?: boolean; isAthlete?: boolean };

function signedInAs(user: Session) {
  useSessionMock.mockReturnValue({
    data: { user: { id: "u-1", email: "coach@example.test", ...user } },
    isPending: false,
  });
}

const SCREEN = "écran gardé";

/** Monte la garde sur `/feedbacks?feedback=f-1` — le lien profond d'une notification. */
function setup(fallback?: React.ReactNode) {
  return renderInRoute(
    <CmvRoleGate capability="coach" fallback={fallback}>
      <p>{SCREEN}</p>
    </CmvRoleGate>,
    { path: "/feedbacks", search: { feedback: "f-1" }, links: ["/login", "/"] },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CmvRoleGate", () => {
  it("n'accorde ni ne refuse tant que la session n'est pas résolue", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });
    const { router, getByText, queryByText } = await setup();

    // Refuser ici ferait clignoter un renvoi vers la connexion à chaque F5 ; accorder ouvrirait
    // l'écran coach à n'importe qui le temps d'un aller-retour.
    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByText(SCREEN)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/feedbacks");
  });

  it("monte l'écran quand la capacité est là", async () => {
    signedInAs({ isCoach: true });
    const { getByText } = await setup();

    expect(getByText(SCREEN)).toBeInTheDocument();
  });

  describe("sans session", () => {
    beforeEach(() => {
      useSessionMock.mockReturnValue({ data: null, isPending: false });
    });

    it("renvoie à la connexion en emportant la page demandée", async () => {
      const { router, queryByText } = await setup();

      // Le débrief ouvert depuis la notification doit survivre à la reconnexion (#337) : sans
      // la cible, le coach atterrissait sur l'accueil et devait le rechercher.
      await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
      expect(router.state.location.search).toEqual({ redirect: "/feedbacks?feedback=f-1" });
      expect(queryByText(SCREEN)).not.toBeInTheDocument();
    });

    it("remplace la page refusée dans l'historique", async () => {
      const { router } = await setup();

      await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
      // Une seule entrée : la page refusée n'y est plus. Sinon Retour y ramenait, elle renvoyait
      // aussitôt vers la connexion, et l'utilisateur tournait en rond (#337).
      expect(router.history.length).toBe(1);
    });
  });

  describe("sans la capacité", () => {
    beforeEach(() => {
      signedInAs({ isAthlete: true });
    });

    it("renvoie à l'accueil, en remplaçant la page refusée", async () => {
      const { router, queryByText } = await setup();

      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect(router.history.length).toBe(1);
      expect(queryByText(SCREEN)).not.toBeInTheDocument();
    });

    it("rend le repli de la route quand elle en fournit un", async () => {
      const { getByText, queryByText } = await setup(<p>repli</p>);

      expect(getByText("repli")).toBeInTheDocument();
      expect(queryByText(SCREEN)).not.toBeInTheDocument();
    });
  });

  it("accepte une capacité parmi plusieurs", async () => {
    signedInAs({ isAthlete: true });
    const { getByText } = await renderInRoute(
      <CmvRoleGate capability={["coach", "athlete"]}>
        <p>{SCREEN}</p>
      </CmvRoleGate>,
      { path: "/invoices", links: ["/login", "/"] },
    );

    // `/invoices` sert les deux rôles : une seule des capacités listées suffit.
    expect(getByText(SCREEN)).toBeInTheDocument();
  });
});

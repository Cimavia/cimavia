import { act, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../test/render";
import { CmvRoleGate } from "./CmvRoleGate";

type SessionState = {
  data: { user: { id: string; email: string; isCoach?: boolean; isAthlete?: boolean } } | null;
  isPending: boolean;
};

/**
 * Une session RÉACTIVE, là où les autres fichiers se contentent d'un `mockReturnValue` : la perte
 * de session arrive PENDANT que l'écran est monté, et c'est ce passage — pas un état figé avant le
 * rendu — que la garde doit traverser sans démonter l'écran (#336).
 */
const sessionStore = vi.hoisted(() => {
  let state: SessionState = { data: null, isPending: true };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: SessionState) {
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => useSyncExternalStore(sessionStore.subscribe, sessionStore.get),
  },
}));

const COACH = { id: "u-1", email: "coach@example.test", isCoach: true };

function signedInAs(user: Omit<NonNullable<SessionState["data"]>["user"], "id" | "email">) {
  sessionStore.set({ data: { user: { ...COACH, isCoach: false, ...user } }, isPending: false });
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
    sessionStore.set({ data: null, isPending: true });
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
      sessionStore.set({ data: null, isPending: false });
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
      expect(router.history).toHaveLength(1);
    });
  });

  describe("sans la capacité", () => {
    beforeEach(() => {
      signedInAs({ isAthlete: true });
    });

    it("renvoie à l'accueil, en remplaçant la page refusée", async () => {
      const { router, queryByText } = await setup();

      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect(router.history).toHaveLength(1);
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

  describe("quand la session tombe sous un écran déjà ouvert", () => {
    const DRAFT = "Tractions lestées";

    /** Le constructeur du constat : un champ rempli, dont l'état ne vit qu'en mémoire. */
    async function withDraft() {
      signedInAs({ isCoach: true });
      const view = await renderInRoute(
        <CmvRoleGate capability="coach">
          <label>
            titre
            <input />
          </label>
        </CmvRoleGate>,
        { path: "/library/exercises/new", links: ["/login", "/"] },
      );
      await view.user.type(view.getByLabelText("titre"), DRAFT);
      return view;
    }

    it("garde l'écran monté sous la fenêtre de reconnexion", async () => {
      const view = await withDraft();

      act(() => sessionStore.set({ data: null, isPending: false }));

      // Le renvoi vers `/login` démontait le constructeur : c'est la perte que le constat
      // reprochait. L'écran reste, sa saisie aussi — seulement mis hors d'atteinte.
      expect(view.getByRole("dialog", { name: "auth.reauth.title" })).toBeInTheDocument();
      expect(view.getByText(COACH.email)).toBeInTheDocument();
      expect(view.getByDisplayValue(DRAFT).closest("[inert]")).not.toBeNull();
      expect(view.router.state.location.pathname).toBe("/library/exercises/new");
    });

    it("ne repasse pas par le chargement quand la session se relit", async () => {
      const view = await withDraft();
      act(() => sessionStore.set({ data: null, isPending: false }));

      // Le retour sur l'onglet relance la lecture de session, qui repasse `isPending` à vrai.
      // Afficher « Chargement » ici démonterait l'écran qu'on garde.
      act(() => sessionStore.set({ data: null, isPending: true }));

      expect(view.queryByText("common.loading")).not.toBeInTheDocument();
      expect(view.getByDisplayValue(DRAFT)).toBeInTheDocument();
    });

    it("rend l'écran intact quand le même compte revient", async () => {
      const view = await withDraft();
      act(() => sessionStore.set({ data: null, isPending: false }));

      act(() => signedInAs({ isCoach: true }));

      expect(view.queryByRole("dialog")).not.toBeInTheDocument();
      expect(view.getByDisplayValue(DRAFT).closest("[inert]")).toBeNull();
    });

    it("ne livre pas l'écran à un autre compte", async () => {
      const view = await withDraft();

      // Déconnecté puis reconnecté sous un autre compte dans un autre onglet : celui-ci relit la
      // session et trouve quelqu'un d'autre. Le brouillon et le cache sont ceux du premier.
      act(() =>
        sessionStore.set({
          data: { user: { id: "u-2", email: "autre@example.test", isCoach: true } },
          isPending: false,
        }),
      );

      expect(view.getByRole("dialog", { name: "auth.reauth.title" })).toBeInTheDocument();
      expect(view.getByText(COACH.email)).toBeInTheDocument();
      expect(view.getByDisplayValue(DRAFT).closest("[inert]")).not.toBeNull();
    });
  });
});

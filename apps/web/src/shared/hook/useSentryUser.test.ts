import * as Sentry from "@sentry/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSentryUser } from "@/shared/hook/useSentryUser";
import { authClient } from "@/shared/lib/auth";

vi.mock("@sentry/react", () => ({ setUser: vi.fn() }));
vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));

type Session = { data: { user: { id: string } } | null };

function session(id: string | null): Session {
  return { data: id === null ? null : { user: { id } } };
}

function setup(initial: string | null) {
  vi.mocked(authClient.useSession).mockReturnValue(
    session(initial) as unknown as ReturnType<typeof authClient.useSession>,
  );

  const view = renderHook(() => useSentryUser());
  return {
    ...view,
    /** Rejoue le rendu avec une autre session — une connexion, une déconnexion, un changement. */
    signInAs(next: string | null) {
      vi.mocked(authClient.useSession).mockReturnValue(
        session(next) as unknown as ReturnType<typeof authClient.useSession>,
      );
      view.rerender();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSentryUser", () => {
  it("rattache les erreurs au compte connecté, et à rien d'autre", () => {
    setup("u-1");

    // L'`id` SEUL : ni nom ni e-mail. C'est ce qui fait que Sentry ne détient qu'un pseudonyme.
    expect(Sentry.setUser).toHaveBeenCalledExactlyOnceWith({ id: "u-1" });
  });

  it("n'attribue rien tant que personne n'est connecté", () => {
    setup(null);

    expect(Sentry.setUser).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("efface l'identité à la déconnexion", () => {
    const { signInAs } = setup("u-1");

    signInAs(null);

    // Sans cet effacement, le compte suivant sur ce navigateur hériterait de `u-1` et ses erreurs
    // seraient attribuées à quelqu'un qui n'était pas là.
    expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it("suit le changement de compte", () => {
    const { signInAs } = setup("u-1");

    signInAs("u-2");

    expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: "u-2" });
  });

  it("ne repose pas l'identité à chaque rendu", () => {
    const { signInAs } = setup("u-1");

    signInAs("u-1");

    // L'effet est clé sur l'`id` : un rendu de plus (une navigation, un refetch de session) ne
    // doit pas rejouer l'écriture, sans quoi le hook deviendrait bruyant sans rien apporter.
    expect(Sentry.setUser).toHaveBeenCalledOnce();
  });
});

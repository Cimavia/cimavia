import * as Sentry from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ captureMessage: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Le client exporté, et non un client de test : c'est son branchement que ce cas protège (#439). */
describe("authClient — réponse illisible de get-session", () => {
  it("n'en fait pas une session, et le signale", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      ),
    );
    const { authClient } = await import("./auth");
    const session = authClient.$store.atoms.session;

    await session?.get().refetch();

    expect(session?.get().data).toBeNull();
    expect(session?.get().error?.status).toBe(502);
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });
});

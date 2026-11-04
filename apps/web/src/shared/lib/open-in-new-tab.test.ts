import { afterEach, describe, expect, it, vi } from "vitest";
import { openInNewTab } from "./open-in-new-tab";

function fakeTab(closed = false) {
  return { closed, opener: {}, location: { href: "" }, close: vi.fn() };
}

function openReturns(tab: ReturnType<typeof fakeTab> | null) {
  return vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openInNewTab", () => {
  it("dirige l'onglet ouvert dans le geste vers l'url obtenue, lien vers la page coupé", async () => {
    const tab = fakeTab();
    openReturns(tab);

    await expect(openInNewTab(async () => "https://x/plan.pdf")).resolves.toBe("opened");

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(tab.location.href).toBe("https://x/plan.pdf");
    expect(tab.opener).toBeNull();
  });

  it("dit l'onglet bloqué sans même re-signer", async () => {
    openReturns(null);
    const resolve = vi.fn(async () => "https://x/plan.pdf");

    await expect(openInNewTab(resolve)).resolves.toBe("blocked");
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["introuvable", async () => null],
    [
      "dont la re-signature lève",
      async () => {
        throw new Error("réseau");
      },
    ],
  ])("referme l'onglet vide sur une url %s", async (_case, resolve) => {
    const tab = fakeTab();
    openReturns(tab);

    await expect(openInNewTab(resolve)).resolves.toBe("failed");
    expect(tab.close).toHaveBeenCalledOnce();
    expect(tab.location.href).toBe("");
  });

  it("ne dirige pas un onglet que l'utilisateur a refermé pendant l'attente", async () => {
    const tab = fakeTab(true);
    openReturns(tab);

    await expect(openInNewTab(async () => "https://x/plan.pdf")).resolves.toBe("closed");
    expect(tab.location.href).toBe("");
  });
});

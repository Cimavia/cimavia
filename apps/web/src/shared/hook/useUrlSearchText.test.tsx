import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUrlSearchText } from "./useUrlSearchText";

// L'URL à jour du routeur, que `navigate` avance sur-le-champ — l'URL RENDUE, elle, n'avance qu'en
// fin de transition, à la main dans ces tests.
const router = vi.hoisted(() => ({ latestLocation: { search: {} as { q?: unknown } } }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));

function mount(initial: string | undefined) {
  router.latestLocation.search = { q: initial };
  const write = vi.fn((next: string | undefined) => {
    router.latestLocation.search = { q: next };
  });
  const view = renderHook(({ url }) => useUrlSearchText(url, write), {
    initialProps: { url: initial },
  });
  const type = (next: string) => act(() => view.result.current[1](next));
  const rendered = (url: string | undefined) => view.rerender({ url });
  /** Une navigation venue d'ailleurs, que le routeur finit par rendre. */
  const navigatedElsewhere = (url: string | undefined) => {
    router.latestLocation.search = { q: url };
    rendered(url);
  };
  return { write, type, rendered, navigatedElsewhere, text: () => view.result.current[0] };
}

describe("useUrlSearchText", () => {
  it("part du texte de l'url", () => {
    expect(mount("bel").text()).toBe("bel");
    expect(mount(undefined).text()).toBe("");
  });

  it("garde chaque frappe et l'écrit, un champ vidé sortant de l'url", () => {
    const { write, type, text } = mount(undefined);

    type("b");
    type("be");
    type("");

    expect(text()).toBe("");
    expect(write.mock.calls).toEqual([["b"], ["be"], [undefined]]);
  });

  it("n'efface rien quand l'url rendue rattrape la saisie en retard, étape sautée comprise", () => {
    const { type, rendered, text } = mount(undefined);

    type("b");
    type("be");
    type("bel");
    rendered("b");
    expect(text()).toBe("bel");

    rendered("bel");
    expect(text()).toBe("bel");
  });

  it("se recale sur l'url quand elle change d'ailleurs, comme une remise à zéro", () => {
    const { type, rendered, navigatedElsewhere, text } = mount(undefined);

    type("bel");
    rendered("bel");
    navigatedElsewhere(undefined);

    expect(text()).toBe("");
  });

  // La transition n'a rendu que la dernière étape, identique à l'url de départ : aucun écho n'a été
  // vu, et la remise à zéro qui suit se reconnaît quand même.
  it("prend une remise à zéro après une saisie effacée puis retapée sans écho", () => {
    const { type, navigatedElsewhere, text } = mount("a");

    type("");
    type("a");
    navigatedElsewhere(undefined);

    expect(text()).toBe("");
  });

  // Réinitialiser avant que la frappe ne soit rendue : l'url rendue ne bouge pas, le champ si.
  it("se vide sur une remise à zéro qui laisse l'url rendue telle quelle", () => {
    const { type, navigatedElsewhere, text } = mount(undefined);

    type("bel");
    navigatedElsewhere(undefined);

    expect(text()).toBe("");
  });

  // `?q=42` tapé à la main : le routeur le lit comme un nombre, que la validation de la route écarte.
  it("lit un q qui n'est pas une chaîne comme la route : sans recherche", () => {
    const { rendered, text } = mount("bel");

    router.latestLocation.search = { q: 42 };
    rendered(undefined);

    expect(text()).toBe("");
  });
});

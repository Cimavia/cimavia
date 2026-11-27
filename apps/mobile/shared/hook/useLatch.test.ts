import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLatch } from "./useLatch";

const render = (key: string, value: boolean) =>
  renderHook((props: { key: string; value: boolean }) => useLatch(props.key, props.value), {
    initialProps: { key, value },
  });

describe("useLatch", () => {
  it("reste faux tant que la valeur ne l'a jamais été", () => {
    const { result, rerender } = render("s-1", false);
    rerender({ key: "s-1", value: false });

    expect(result.current).toBe(false);
  });

  // Une relance remet la requête en `pending` : l'écran ne doit pas se remettre à attendre.
  it("reste vrai quand la valeur retombe, pour la même clé", () => {
    const { result, rerender } = render("s-1", true);
    rerender({ key: "s-1", value: false });

    expect(result.current).toBe(true);
  });

  it("repart de zéro sur une autre clé", () => {
    const { result, rerender } = render("s-1", true);
    rerender({ key: "s-2", value: false });

    expect(result.current).toBe(false);
  });
});

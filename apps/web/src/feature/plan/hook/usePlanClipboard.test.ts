import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPlanClipboard,
  forgetPlanClipboardSource,
  type PlanWeekClipboard,
  usePlanClipboard,
} from "./usePlanClipboard";

const STORAGE_KEY = "cmv.planClipboard";

const COPIED: PlanWeekClipboard = {
  planWeekId: "w-1",
  planId: "plan-1",
  planTitle: "Bloc force — Léa",
  weekNumber: 2,
};

/** Le hook monté, avec une semaine déjà copiée. */
function withCopiedWeek() {
  const view = renderHook(() => usePlanClipboard());
  act(() => view.result.current.copyWeek(COPIED));
  return view;
}

beforeEach(() => {
  clearPlanClipboard();
});

describe("usePlanClipboard", () => {
  it("garde la semaine copiée dans l'onglet", () => {
    const { result } = withCopiedWeek();

    // `sessionStorage` : elle survit au changement de route — copier dans un cycle pour coller
    // dans un autre est la moitié de la feature (#4).
    expect(result.current.clipboard).toEqual(COPIED);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")).toEqual(COPIED);
  });

  it("se vide hors de tout composant, au changement de compte", () => {
    const { result } = withCopiedWeek();

    act(() => clearPlanClipboard());

    // Le coach suivant sur un poste partagé voyait le titre d'un cycle d'un autre tenant (#341) :
    // le stockage ET l'instantané rendu doivent partir, sinon le bandeau resterait affiché.
    expect(result.current.clipboard).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  describe("quand sa source disparaît", () => {
    it.each([
      [{ planWeekId: "w-1" }, "la semaine copiée"],
      [{ planId: "plan-1" }, "le cycle qui la porte"],
    ])("s'oublie avec %o (%s)", (source, _what) => {
      const { result } = withCopiedWeek();

      act(() => forgetPlanClipboardSource(source));

      expect(result.current.clipboard).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it.each([
      [{ planWeekId: "w-9" }, "une autre semaine"],
      [{ planId: "plan-9" }, "un autre cycle"],
    ])("reste armé quand disparaît %o (%s)", (source, _what) => {
      const { result } = withCopiedWeek();

      act(() => forgetPlanClipboardSource(source));

      expect(result.current.clipboard).toEqual(COPIED);
    });

    it("ne fait rien quand rien n'est copié", () => {
      forgetPlanClipboardSource({ planId: "plan-1" });

      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});

import { act, renderHook } from "@testing-library/react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { currentBlockOf, useBlockScrollSpy } from "@/feature/plan/hook/useBlockScrollSpy";

const at = (y: number, height = 600, content = 3000) => ({
  contentOffset: { x: 0, y },
  layoutMeasurement: { width: 400, height },
  contentSize: { width: 400, height: content },
});

const event = (y: number, content = 3000) =>
  ({ nativeEvent: at(y, 600, content) }) as unknown as NativeSyntheticEvent<NativeScrollEvent>;

describe("currentBlockOf", () => {
  it("désigne le dernier bloc passé sous le haut de l'écran, le premier au départ", () => {
    expect(currentBlockOf([100, 900, 1800], at(0))).toBe(0);
    expect(currentBlockOf([100, 900, 1800], at(950))).toBe(1);
  });

  it("désigne le dernier bloc au bas du contenu, même s'il n'a pas pu remonter", () => {
    expect(currentBlockOf([100, 900, 2700], at(2400))).toBe(2);
  });

  it("reste au premier sans bloc mesuré", () => {
    expect(currentBlockOf([], at(2400))).toBe(0);
  });
});

describe("useBlockScrollSpy", () => {
  function mount(count = 3) {
    const scrollTo = vi.fn();
    const ref = { current: { scrollTo } as unknown as ScrollView };
    const hook = renderHook(() => useBlockScrollSpy(ref, count));
    act(() => {
      hook.result.current.measureList(200);
      [0, 800, 1600].forEach((top, index) => {
        hook.result.current.measureBlock(index, top);
      });
    });
    return { ...hook, scrollTo };
  }

  it("suit le défilement, hauteur de la liste comprise", () => {
    const { result } = mount();

    act(() => result.current.onScroll(event(1100)));
    expect(result.current.current).toBe(1);
  });

  it("ignore les blocs retirés depuis leur mesure", () => {
    const { result } = mount(2);

    act(() => result.current.onScroll(event(1900)));
    expect(result.current.current).toBe(1);
  });

  it("garde la puce touchée jusqu'à ce que l'athlète fasse défiler lui-même", () => {
    const { result, scrollTo } = mount();

    act(() => result.current.scrollTo(2));
    expect(scrollTo).toHaveBeenCalledWith({ y: 1800, animated: true });
    expect(result.current.current).toBe(2);

    // Le défilement lancé par la puce ne la déloge pas.
    act(() => result.current.onScroll(event(1100)));
    expect(result.current.current).toBe(2);

    act(() => {
      result.current.release();
      result.current.onScroll(event(0));
    });
    expect(result.current.current).toBe(0);
  });
});

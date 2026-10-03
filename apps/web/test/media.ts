import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

/**
 * jsdom ne joue rien : `play` et `pause` des lecteurs rendus deviennent observables, dans l'ordre
 * du document.
 */
export function stubPlayback(container: HTMLElement): HTMLMediaElement[] {
  const elements = [...container.querySelectorAll<HTMLMediaElement>("audio, video")];
  for (const element of elements) {
    element.play = vi.fn(async () => undefined);
    element.pause = vi.fn();
  }
  return elements;
}

/** Une note lancée qui va au bout : le navigateur la met en pause, PUIS annonce `ended`. */
export function playToTheEnd(element: HTMLMediaElement): void {
  fireEvent.play(element);
  Object.defineProperty(element, "ended", { configurable: true, value: true });
  fireEvent.pause(element);
  fireEvent.ended(element);
}

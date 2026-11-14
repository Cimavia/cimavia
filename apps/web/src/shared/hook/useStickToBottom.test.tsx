import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNearBottom, NEAR_BOTTOM_PX, useStickToBottom } from "./useStickToBottom";

/**
 * jsdom ne met rien en page : ni hauteur, ni défilement, ni `ResizeObserver`. Le fil est donc
 * simulé — des mesures que le test fixe, un `scrollTop` qui retient ce qu'on y écrit, et des
 * observateurs que le test déclenche à la main, comme le ferait une photo qui finit de charger.
 */
type Metrics = { scrollTop: number; scrollHeight: number; clientHeight: number };

let observed: Array<{ node: Element; callback: () => void; disconnected: boolean }> = [];

class FakeResizeObserver {
  private readonly entries: typeof observed = [];
  constructor(private readonly callback: () => void) {}
  observe(node: Element) {
    const entry = { node, callback: this.callback, disconnected: false };
    this.entries.push(entry);
    observed.push(entry);
  }
  disconnect() {
    for (const entry of this.entries) entry.disconnected = true;
  }
}

/** Ce qui grandit : on fait grossir le contenu, puis on prévient ses observateurs. */
function grow(metrics: Metrics, by: number) {
  metrics.scrollHeight += by;
  act(() => {
    for (const entry of observed) if (!entry.disconnected) entry.callback();
  });
}

function Harness() {
  const thread = useStickToBottom();
  return (
    <div>
      <div data-testid="scroll" ref={thread.scrollRef}>
        <div ref={thread.contentRef} />
      </div>
      <p>{thread.atBottom ? "au bas" : "décroché"}</p>
      <button type="button" onClick={thread.stickToBottom}>
        coller
      </button>
      <button type="button" onClick={thread.scrollToBottom}>
        descendre
      </button>
    </div>
  );
}

/** Un fil de 1 000 px vu par une fenêtre de 400, d'abord en haut. */
function setup(start: Partial<Metrics> = {}) {
  const metrics: Metrics = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400, ...start };
  const scrollTo = vi.fn();
  // Les mesures sont posées sur le prototype AVANT le montage : la ref les lit dès l'attache.
  Object.defineProperties(HTMLElement.prototype, {
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => {
        metrics.scrollTop = Math.min(value, metrics.scrollHeight - metrics.clientHeight);
      },
    },
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight },
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
  });
  HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  const view = render(<Harness />);
  const scroll = screen.getByTestId("scroll");
  /** Le lecteur défile jusqu'à `scrollTop`. */
  const scrollAt = (scrollTop: number) => {
    metrics.scrollTop = scrollTop;
    fireEvent.scroll(scroll);
  };
  return { metrics, scrollTo, scrollAt, view };
}

beforeEach(() => {
  observed = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ["scrollTop", "scrollHeight", "clientHeight", "scrollTo"] as const) {
    Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

describe("isNearBottom", () => {
  it("est au bas tant que l'écart tient dans le seuil", () => {
    expect(isNearBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(
      isNearBottom({ scrollTop: 600 - NEAR_BOTTOM_PX, scrollHeight: 1000, clientHeight: 400 }),
    ).toBe(true);
  });

  it("décroche au-delà du seuil", () => {
    expect(
      isNearBottom({ scrollTop: 599 - NEAR_BOTTOM_PX, scrollHeight: 1000, clientHeight: 400 }),
    ).toBe(false);
  });

  // Un fil plus court que sa fenêtre ne défile pas : on y est toujours au bas.
  it("est au bas d'un fil qui ne défile pas", () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(true);
  });
});

describe("useStickToBottom (#367)", () => {
  it("colle au bas dès l'ouverture, quand le contenu prend sa taille", () => {
    const { metrics } = setup();
    grow(metrics, 0);
    expect(metrics.scrollTop).toBe(600);
  });

  // Le cœur de #367 : la photo charge APRÈS le premier défilement et pousse le contenu.
  it("suit une photo qui charge après coup, tant que le lecteur est au bas", () => {
    const { metrics } = setup({ scrollTop: 600 });
    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(900);
    expect(screen.getByText("au bas")).toBeInTheDocument();
  });

  it("laisse en place un lecteur qui remonte l'historique", () => {
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);
    expect(screen.getByText("décroché")).toBeInTheDocument();

    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(100);
  });

  it("recolle un lecteur revenu au bas de lui-même", () => {
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);
    scrollAt(600);
    expect(screen.getByText("au bas")).toBeInTheDocument();

    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(900);
  });

  it("ramène et recolle sur demande", () => {
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);

    fireEvent.click(screen.getByRole("button", { name: "coller" }));
    expect(metrics.scrollTop).toBe(600);
    expect(screen.getByText("au bas")).toBeInTheDocument();

    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(900);
  });

  it("descend en douceur à la demande du lecteur, et recolle dès le geste", () => {
    const { metrics, scrollTo, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);

    fireEvent.click(screen.getByRole("button", { name: "descendre" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(screen.getByText("au bas")).toBeInTheDocument();

    // Une photo charge pendant la descente : le fil la suit au lieu de s'arrêter à court.
    scrollAt(300);
    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(900);
  });

  // L'écart au bas dépasse le seuil sans que le lecteur ait bougé : une photo a chargé entre
  // l'écriture de `scrollTop` et l'événement qu'elle provoque. Le fil ne se décroche pas pour ça.
  it("ne se décroche pas quand le contenu grandit sous un lecteur immobile", () => {
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    metrics.scrollHeight += 300;
    scrollAt(600);
    expect(screen.getByText("au bas")).toBeInTheDocument();

    grow(metrics, 0);
    expect(metrics.scrollTop).toBe(900);
  });

  it("reste décroché quand le lecteur redescend sans atteindre le bas", () => {
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);
    scrollAt(300);
    expect(screen.getByText("décroché")).toBeInTheDocument();

    grow(metrics, 300);
    expect(metrics.scrollTop).toBe(300);
  });

  it("cesse d'observer une fois démonté", () => {
    const { view } = setup();
    view.unmount();
    expect(observed.every((entry) => entry.disconnected)).toBe(true);
  });

  it("ne casse rien sans ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { metrics, scrollAt } = setup({ scrollTop: 600 });
    scrollAt(100);
    fireEvent.click(screen.getByRole("button", { name: "coller" }));
    expect(metrics.scrollTop).toBe(600);
  });
});

import { describe, expect, it, vi } from "vitest";
import { RestBanner } from "@/feature/plan/component/RestBanner";
import { press, pressButton, renderRn } from "@/test/render";

const handlers = () => ({
  onPause: vi.fn(),
  onResume: vi.fn(),
  onSkip: vi.fn(),
  onAdd: vi.fn(),
  onExpand: vi.fn(),
});

function renderBanner(over: Partial<Parameters<typeof RestBanner>[0]> = {}) {
  const props = {
    remaining: 45,
    total: 90,
    label: "repos · série 2 sur 4",
    isPaused: false,
    armed: true,
    ...handlers(),
    ...over,
  };
  return { props, ...renderRn(<RestBanner {...props} />) };
}

const widths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[style]")).map((node) => node.style.width);

describe("RestBanner", () => {
  /** La barre montre le temps RESTANT : elle se vide, elle ne se remplit pas. */
  it("montre le temps restant, en chiffre et en barre", () => {
    const { container } = renderBanner();

    expect(container.textContent).toContain("45 s");
    expect(widths(container)).toContain("50%");
  });

  it("vide la barre d'un repos sans durée plutôt que de la remplir", () => {
    const { container } = renderBanner({ remaining: 10, total: 0 });

    expect(widths(container)).toContain("0%");
  });

  it("met en pause un repos qui court", () => {
    const { props, container } = renderBanner();

    pressButton(container, "plan.timer.pause");

    expect(props.onPause).toHaveBeenCalledOnce();
    expect(props.onResume).not.toHaveBeenCalled();
  });

  it("reprend un repos en pause", () => {
    const { props, container } = renderBanner({ isPaused: true });

    pressButton(container, "plan.timer.resume");

    expect(props.onResume).toHaveBeenCalledOnce();
    expect(props.onPause).not.toHaveBeenCalled();
  });

  it.each([
    ["plan.timer.add", "onAdd"],
    ["plan.timer.skip", "onSkip"],
  ] as const)("relaie %s", (label, handler) => {
    const { props, getByText } = renderBanner();

    press(getByText(label));

    expect(props[handler]).toHaveBeenCalledOnce();
  });

  it("s'agrandit", () => {
    const { props, getByLabelText } = renderBanner();

    press(getByLabelText("plan.timer.expand"));

    expect(props.onExpand).toHaveBeenCalledOnce();
  });

  /** Un minuteur muet qu'on croit armé est pire que pas de minuteur : on le DIT. */
  it("dit que le repos ne sonnera pas téléphone rangé, et seulement dans ce cas", () => {
    const { queryByText, rerender, props } = renderBanner({ armed: false });
    expect(queryByText("plan.timer.notArmed")).not.toBeNull();

    rerender(<RestBanner {...props} armed />);
    expect(queryByText("plan.timer.notArmed")).toBeNull();
  });
});

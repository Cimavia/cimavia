import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Size } from "@/shared/util/resize.util";
import { renderWithProviders } from "../../../test/render";
import { CmvResizeHandle } from "./CmvResizeHandle";

const MIN = { width: 320, height: 384 };
const MAX = { width: 600, height: 700 };

// La poignée ne garde aucune taille : son appelant la tient, comme le panneau en vrai.
function Resizable({ axis, from }: Readonly<{ axis: "x" | "xy"; from: Size }>) {
  const [size, setSize] = useState(from);
  return (
    <>
      <CmvResizeHandle axis={axis} size={size} min={MIN} max={MAX} onResize={setSize} />
      <output>{`${size.width}×${size.height}`}</output>
    </>
  );
}

function mount(axis: "x" | "xy", from: Size = MIN) {
  const view = renderWithProviders(<Resizable axis={axis} from={from} />);
  const handle = view.getByRole("separator");
  return { ...view, handle, size: () => view.container.querySelector("output")?.textContent };
}

describe("CmvResizeHandle — au clavier", () => {
  // Ancré à droite : la flèche gauche éloigne le bord gauche, donc élargit.
  it("élargit vers la gauche, rétrécit vers la droite, et plus vite avec Maj", async () => {
    const { user, handle, size } = mount("xy");
    handle.focus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(size()).toBe("352×384");
    await user.keyboard("{ArrowRight}");
    expect(size()).toBe("336×384");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(size()).toBe("400×384");
  });

  it("règle la hauteur au coin, de haut en bas", async () => {
    const { user, handle, size } = mount("xy");
    handle.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");

    expect(size()).toBe("320×400");
  });

  // Un bord n'a qu'une dimension : les flèches verticales lui restent étrangères.
  it("ignore haut et bas sur un bord", async () => {
    const { user, handle, size } = mount("x");
    handle.focus();

    await user.keyboard("{ArrowDown}{ArrowUp}");

    expect(size()).toBe("320×384");
  });

  it("s'arrête aux bornes", async () => {
    const { user, handle, size } = mount("xy", { width: 592, height: 384 });
    handle.focus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowUp}");

    expect(size()).toBe("600×384");
  });

  it("annonce sa largeur et ses bornes", () => {
    const { handle } = mount("x", { width: 400, height: 384 });

    expect(handle).toHaveAttribute("aria-valuenow", "400");
    expect(handle).toHaveAttribute("aria-valuemin", "320");
    expect(handle).toHaveAttribute("aria-valuemax", "600");
    expect(handle).toHaveAccessibleName("common.resize.width");
  });
});

describe("CmvResizeHandle — au pointeur", () => {
  it("suit le geste depuis son départ, bornes comprises", () => {
    const { handle, size } = mount("xy");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400, clientY: 150 });
    expect(size()).toBe("420×434");

    // Bloquée à la borne, puis le pointeur revient : la taille suit le pointeur, pas la borne.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0, clientY: 150 });
    expect(size()).toBe("600×434");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 450, clientY: 150 });
    expect(size()).toBe("370×434");
  });

  it("ne bouge plus une fois relâchée", () => {
    const { handle, size } = mount("x");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300, clientY: 0 });

    expect(size()).toBe("320×384");
  });

  // Le clic droit ouvre un menu contextuel, il ne saisit rien.
  it("ignore un autre bouton que le principal", () => {
    const { handle, size } = mount("x");

    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300, clientY: 0 });

    expect(size()).toBe("320×384");
  });
});

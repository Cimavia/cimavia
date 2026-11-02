import { fireEvent } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Size } from "@/shared/util/resize.util";
import { renderWithProviders } from "../../../test/render";
import { CmvResizeHandle } from "./CmvResizeHandle";

const MIN = { width: 320, height: 384 };
const MAX = { width: 600, height: 700 };

// La poignée ne garde aucune taille : son appelant la tient, comme le panneau en vrai.
function Corner({ from, onEnd }: Readonly<{ from: Size; onEnd: (size: Size) => void }>) {
  const [size, setSize] = useState(from);
  return (
    <>
      <CmvResizeHandle
        axis="xy"
        size={size}
        min={MIN}
        max={MAX}
        onResize={setSize}
        onResizeEnd={(end) => {
          setSize(end);
          onEnd(end);
        }}
      />
      <output>{`${size.width}×${size.height}`}</output>
    </>
  );
}

function Edge({ from, onEnd }: Readonly<{ from: number; onEnd: (width: number) => void }>) {
  const [width, setWidth] = useState(from);
  return (
    <>
      <CmvResizeHandle
        axis="x"
        size={width}
        min={MIN.width}
        max={MAX.width}
        onResize={setWidth}
        onResizeEnd={(end) => {
          setWidth(end);
          onEnd(end);
        }}
      />
      <output>{width}</output>
    </>
  );
}

function mount(ui: ReactElement) {
  const view = renderWithProviders(ui);
  const handle = view.getByRole("separator");
  return { ...view, handle, shown: () => view.container.querySelector("output")?.textContent };
}

const corner = (from: Size = MIN, onEnd = vi.fn()) => ({
  ...mount(<Corner from={from} onEnd={onEnd} />),
  onEnd,
});
const edge = (from = MIN.width, onEnd = vi.fn()) => ({
  ...mount(<Edge from={from} onEnd={onEnd} />),
  onEnd,
});

// Bouton principal enfoncé : c'est ce qui distingue un glisser d'un simple survol.
const PRESSED = { pointerId: 1, buttons: 1 };

describe("CmvResizeHandle — au clavier", () => {
  // Ancré à droite : la flèche gauche éloigne le bord gauche, donc élargit.
  it("élargit vers la gauche, rétrécit vers la droite, et plus vite avec Maj", async () => {
    const { user, handle, shown } = corner();
    handle.focus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(shown()).toBe("352×384");
    await user.keyboard("{ArrowRight}");
    expect(shown()).toBe("336×384");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(shown()).toBe("400×384");
  });

  it("règle la hauteur au coin, de haut en bas", async () => {
    const { user, handle, shown } = corner();
    handle.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");

    expect(shown()).toBe("320×400");
  });

  // Un bord n'a qu'une dimension : les flèches verticales lui restent étrangères.
  it("ignore haut et bas sur un bord", async () => {
    const { user, handle, shown, onEnd } = edge();
    handle.focus();

    await user.keyboard("{ArrowDown}{ArrowUp}");

    expect(shown()).toBe("320");
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("s'arrête aux bornes", async () => {
    const { user, handle, shown } = corner({ width: 592, height: 384 });
    handle.focus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowUp}");

    expect(shown()).toBe("600×384");
  });

  // Une flèche est un geste entier : l'appelant la retient aussitôt.
  it("conclut chaque flèche", async () => {
    const { user, handle, onEnd } = edge();
    handle.focus();

    await user.keyboard("{ArrowLeft}");

    expect(onEnd).toHaveBeenCalledWith(336);
  });

  it("annonce sa largeur et ses bornes", () => {
    const { handle } = edge(400);

    expect(handle).toHaveAttribute("aria-valuenow", "400");
    expect(handle).toHaveAttribute("aria-valuemin", "320");
    expect(handle).toHaveAttribute("aria-valuemax", "600");
    expect(handle).toHaveAccessibleName("common.resize.width");
  });
});

describe("CmvResizeHandle — au pointeur", () => {
  it("suit le geste depuis son départ, bornes comprises", () => {
    const { handle, shown } = corner();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 0, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 400, clientY: 150 });
    expect(shown()).toBe("420×434");

    // Bloquée à la borne, puis le pointeur revient : la taille suit le pointeur, pas la borne.
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 0, clientY: 150 });
    expect(shown()).toBe("600×434");
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 450, clientY: 150 });
    expect(shown()).toBe("370×434");
  });

  // Pendant le geste, rien n'est retenu : seulement au relâchement, et une fois.
  it("ne conclut qu'au relâchement, puis ne bouge plus", () => {
    const { handle, shown, onEnd } = edge();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 0, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 400, clientY: 0 });
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 300, clientY: 0 });

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(420);
    expect(shown()).toBe("420");
  });

  // Relâché hors de vue (capture perdue, hors de la fenêtre) : un survol ne redimensionne plus.
  it("termine le geste au premier mouvement sans bouton", () => {
    const { handle, shown, onEnd } = edge();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 0, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 450, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 0, clientX: 300, clientY: 0 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 200, clientY: 0 });

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(370);
    expect(shown()).toBe("370");
  });

  it("termine le geste quand la capture se perd", () => {
    const { handle, onEnd } = edge();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 0, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 480, clientY: 0 });
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 300, clientY: 0 });

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(340);
  });

  // Un clic n'a rien choisi : retenir la taille d'origine figerait un panneau qui suivait son contenu.
  it("ne conclut rien d'un clic sans mouvement", () => {
    const { handle, onEnd } = edge();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 0, clientX: 500, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onEnd).not.toHaveBeenCalled();
  });

  // Le clic droit ouvre un menu contextuel, il ne saisit rien.
  it("ignore un autre bouton que le principal", () => {
    const { handle, shown } = edge();

    fireEvent.pointerDown(handle, { ...PRESSED, button: 2, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(handle, { ...PRESSED, clientX: 300, clientY: 0 });

    expect(shown()).toBe("320");
  });
});

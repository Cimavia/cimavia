import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { press, renderRn } from "@/test/render";
import { CmvImageViewer } from "./CmvImageViewer";

const URL = "https://storage.test/photo.jpg?X-Amz-Date=120000";

/** Les images de la PAGE : le plein écran de `Modal` se monte hors du conteneur du rendu. */
const images = () => [...document.querySelectorAll("img")].map((img) => img.getAttribute("src"));

function pressableOf(image: Element | undefined): Element {
  const pressable = image?.closest("[tabindex]");
  if (pressable == null) throw new Error("image pressable introuvable");
  return pressable;
}

/**
 * Le `Modal` de react-native-web ne se monte ni ne se démonte avant la FIN de son fondu, que jsdom
 * ne joue pas : c'est elle qui le rend actif (et donc sensible au retour système) à l'ouverture,
 * elle qui le retire à la fermeture. On la signale à chaque ancêtre : seul le calque animé y réagit,
 * il ignore l'événement né d'un autre élément. Nom PRÉFIXÉ : jsdom n'expose pas `AnimationEvent`,
 * et React écoute alors `webkitAnimationEnd` — un `fireEvent.animationEnd` n'atteindrait rien.
 */
function finishFade(inside: Element): void {
  for (let node = inside.parentElement; node != null; node = node.parentElement) {
    fireEvent(node, new Event("webkitAnimationEnd", { bubbles: true }));
  }
}

function openFullscreen(): Element {
  const { container } = renderRn(<CmvImageViewer url={URL} />);
  press(pressableOf(container.querySelector("img") ?? undefined));
  const fullscreen = pressableOf([...document.querySelectorAll("img")][1]);
  finishFade(fullscreen);
  return fullscreen;
}

describe("CmvImageViewer", () => {
  it("ne montre que la vignette au repos", () => {
    renderRn(<CmvImageViewer url={URL} />);

    expect(images()).toEqual([URL]);
  });

  /** Le plein écran s'ouvre DANS l'app, sur la même URL signée — pas d'aller-retour navigateur. */
  it("ouvre la même photo en plein écran au tap", () => {
    openFullscreen();

    expect(images()).toEqual([URL, URL]);
  });

  it("referme le plein écran d'un tap n'importe où", () => {
    const fullscreen = openFullscreen();

    press(fullscreen);
    finishFade(fullscreen);

    expect(images()).toEqual([URL]);
  });

  /** Le bouton retour d'Android : c'est `onRequestClose`, que react-native-web relie à Échap. */
  it("referme le plein écran au retour système", () => {
    const fullscreen = openFullscreen();

    fireEvent.keyUp(document, { key: "Escape" });
    finishFade(fullscreen);

    expect(images()).toEqual([URL]);
  });
});

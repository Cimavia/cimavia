import { View } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushLayout, grab, renderRn, stubLayoutWidth, tap } from "@/test/render";
import { CmvSeekBar } from "./CmvSeekBar";

// Une barre de 200 px pour une note de 90 s : un pixel vaut 0,45 s, le milieu 45 s.
const WIDTH = 200;

beforeEach(() => {
  stubLayoutWidth(WIDTH);
});

async function setup(props: { total?: number | null; disabled?: boolean } = {}) {
  const onScrub = vi.fn();
  const onSeek = vi.fn();
  const view = renderRn(
    <CmvSeekBar
      position={30}
      total={props.total === undefined ? 90 : props.total}
      disabled={props.disabled ?? false}
      label="seek"
      valueText="0:30 / 1:30"
      onScrub={onScrub}
      onSeek={onSeek}
    />,
  );
  await flushLayout();
  const slider = view.getByRole("slider");
  // La zone qui prend le doigt est l'enfant de la vue accessible : c'est sur elle que l'on touche.
  const zone = slider.firstElementChild;
  if (zone == null) throw new Error("zone tactile introuvable");
  return { ...view, slider, zone, onScrub, onSeek };
}

describe("CmvSeekBar — toucher", () => {
  it("saute au point touché, sans aperçu", async () => {
    const { zone, onScrub, onSeek } = await setup();

    tap(zone, 100);

    expect(onSeek).toHaveBeenCalledExactlyOnceWith(45);
    expect(onScrub).not.toHaveBeenCalled();
  });

  // Un doigt parti à la verticale cherchait à faire défiler la liste : la note ne bouge pas.
  it("ne saute pas quand le doigt part à la verticale", async () => {
    const { zone, onScrub, onSeek } = await setup();

    const finger = grab(zone, 50, 10);
    finger.moveTo(52, 40);
    finger.release(52, 60);

    expect(onSeek).not.toHaveBeenCalled();
    expect(onScrub).not.toHaveBeenCalled();
  });
});

describe("CmvSeekBar — glisser", () => {
  /**
   * Le cœur de l'issue : la note ne saute qu'UNE fois, au relâché. Pendant le glissé, seul
   * l'aperçu suit le doigt — chaque `seekTo` intermédiaire rechargerait la note sous lui.
   */
  it("fait suivre l'aperçu au doigt et ne saute qu'au relâché", async () => {
    const { zone, onScrub, onSeek } = await setup();

    const finger = grab(zone, 50);
    // Sous le seuil : encore un toucher, rien ne glisse.
    finger.moveTo(55);
    expect(onScrub).not.toHaveBeenCalled();

    finger.moveTo(100);
    expect(onScrub).toHaveBeenLastCalledWith(45);
    finger.moveTo(150);
    expect(onScrub).toHaveBeenLastCalledWith(67.5);
    expect(onSeek).not.toHaveBeenCalled();

    finger.release(150);
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(67.5);
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it("borne la position quand le doigt sort de la barre", async () => {
    const { zone, onScrub, onSeek } = await setup();

    const finger = grab(zone, 50);
    finger.moveTo(-40);
    expect(onScrub).toHaveBeenLastCalledWith(0);
    finger.moveTo(320);
    finger.release(320);

    expect(onSeek).toHaveBeenCalledExactlyOnceWith(90);
  });

  /**
   * Un parent qui réclame le doigt en route — la liste qui défile, par exemple : un glissé engagé
   * ne se cède pas, sinon le doigt qui dérive verticalement perdrait la note en plein geste.
   */
  it("garde un glissé engagé quand un parent réclame le doigt", async () => {
    const onScrub = vi.fn();
    const onSeek = vi.fn();
    const parentGrant = vi.fn();
    const view = renderRn(
      <View onMoveShouldSetResponder={() => true} onResponderGrant={parentGrant}>
        <CmvSeekBar
          position={30}
          total={90}
          label="seek"
          valueText="0:30 / 1:30"
          onScrub={onScrub}
          onSeek={onSeek}
        />
      </View>,
    );
    await flushLayout();
    const zone = view.getByRole("slider").firstElementChild;
    if (zone == null) throw new Error("zone tactile introuvable");

    const finger = grab(zone, 50);
    finger.moveTo(100);
    finger.moveTo(150, 40);
    finger.release(150, 40);

    expect(parentGrant).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(67.5);
  });

  // La liste (ou le système) reprend le doigt en route : l'aperçu s'efface, la note reste où elle était.
  it("efface l'aperçu sans sauter quand le geste est repris", async () => {
    const { zone, onScrub, onSeek } = await setup();

    const finger = grab(zone, 50);
    finger.moveTo(100);
    finger.cancel();

    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe("CmvSeekBar — barre inerte", () => {
  it.each([
    ["la durée est inconnue", { total: null }],
    ["la note ne peut pas être lue", { disabled: true }],
  ])("ne réagit pas quand %s", async (_case, props) => {
    const { slider, zone, onScrub, onSeek } = await setup(props);

    tap(zone, 100);
    const finger = grab(zone, 50);
    finger.moveTo(150);
    finger.release(150);

    expect(onSeek).not.toHaveBeenCalled();
    expect(onScrub).not.toHaveBeenCalled();
    expect(slider.getAttribute("aria-disabled")).toBe("true");
  });
});

/**
 * Ce que VoiceOver et TalkBack lisent. Les actions `increment`/`decrement`, elles, ne passent pas
 * par `react-native-web` (dette Q-6) : leur pas s'éprouve dans `seek.util.test.ts`.
 */
describe("CmvSeekBar — accessibilité", () => {
  it("se présente comme un curseur, avec sa position et sa valeur lisible", async () => {
    const { slider } = await setup();

    expect(slider.getAttribute("aria-label")).toBe("seek");
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("90");
    expect(slider.getAttribute("aria-valuenow")).toBe("30");
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30 / 1:30");
    expect(slider.getAttribute("aria-disabled")).not.toBe("true");
  });
});

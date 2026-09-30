import { describe, expect, it, vi } from "vitest";
import { DashboardTile } from "@/feature/dashboard/component/DashboardTile";
import { press, renderRn } from "@/test/render";

/**
 * Ce que la tuile DÉCIDE et qui se lit : le nombre, ou « — », et si elle mène quelque part. Sa
 * couleur d'alerte passe par des `className` que NativeWind ne pose pas dans le DOM de test : elle
 * ne s'affirme pas ici (limite du harnais, #509).
 */
describe("DashboardTile", () => {
  /** « — » et non 0 : un zéro rassurerait à tort sur une donnée qu'on n'a pas pu lire. */
  it("rend « — » tant que le compte est indisponible", () => {
    const { container } = renderRn(
      <DashboardTile label="Débriefs" count={null} hint="à lire" tone="warning" />,
    );

    expect(container.textContent).toBe("Débriefs—à lire");
  });

  it.each([
    ["un zéro", 0],
    ["un compte", 3],
  ])("rend %s tel quel", (_, count) => {
    const { container } = renderRn(
      <DashboardTile label="Débriefs" count={count} hint="à lire" tone="error" />,
    );

    expect(container.textContent).toBe(`Débriefs${count}à lire`);
  });

  it("mène à son écran quand on la touche", () => {
    const onPress = vi.fn();
    const { getByText } = renderRn(
      <DashboardTile label="Débriefs" count={2} hint="à lire" tone="warning" onPress={onPress} />,
    );

    press(getByText("Débriefs"));

    expect(onPress).toHaveBeenCalledOnce();
  });

  /** Une tuile de contexte sans écran cible reste muette plutôt que de mener à un cul-de-sac. */
  it("ne se présente pas comme touchable sans écran à ouvrir", () => {
    const { container } = renderRn(<DashboardTile label="Athlètes" count={4} hint="suivis" />);

    expect(container.querySelector("[tabindex]")).toBeNull();
  });
});

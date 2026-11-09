import { describe, expect, it, vi } from "vitest";
import { pressButton, renderRn } from "@/test/render";
import { CmvButton } from "./CmvButton";

describe("CmvButton", () => {
  it.each(["primary", "danger"] as const)("déclenche son geste (%s)", (variant) => {
    const onPress = vi.fn();
    const { container } = renderRn(
      <CmvButton label="Valider" onPress={onPress} variant={variant} />,
    );

    pressButton(container, "Valider");

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("ne déclenche rien tant qu'il est éteint", () => {
    const onPress = vi.fn();
    const { container } = renderRn(<CmvButton label="Valider" onPress={onPress} disabled />);

    pressButton(container, "Valider");

    expect(onPress).not.toHaveBeenCalled();
  });
});

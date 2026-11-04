import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { useToast } from "./CmvToast";

type Tone = "success" | "error" | "warning" | "info";

function Trigger({ tone, message }: Readonly<{ tone: Tone; message: string }>) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast[tone](message)}>
      déclencher
    </button>
  );
}

describe("CmvToast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<Tone>(["success", "error", "warning", "info"])(
    "annonce un message %s sans déplacer le focus",
    async (tone) => {
      const { user, getByRole } = renderWithProviders(<Trigger tone={tone} message="Enregistré" />);

      await user.click(getByRole("button", { name: "déclencher" }));

      expect(getByRole("status")).toHaveTextContent("Enregistré");
      expect(getByRole("button", { name: "déclencher" })).toHaveFocus();
    },
  );

  it("se ferme au clic, sans attendre son échéance", async () => {
    const { user, getByRole, queryByRole } = renderWithProviders(
      <Trigger tone="info" message="Date recalée" />,
    );
    await user.click(getByRole("button", { name: "déclencher" }));

    await user.click(getByRole("button", { name: "Date recalée" }));

    expect(queryByRole("button", { name: "Date recalée" })).toBeNull();
  });

  it("désarme ses minuteurs au démontage", () => {
    vi.useFakeTimers();
    const { getByRole, unmount } = renderWithProviders(
      <Trigger tone="info" message="Date recalée" />,
    );

    getByRole("button", { name: "déclencher" }).click();
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
  });

  it("refuse d'être appelé hors de son fournisseur", () => {
    // Un toast perdu en silence serait pire qu'un plantage : le geste semblerait sans effet.
    expect(() => render(<Trigger tone="info" message="x" />)).toThrow(
      "[toast] useToast() hors ToastProvider",
    );
  });
});

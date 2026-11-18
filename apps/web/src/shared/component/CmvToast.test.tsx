import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("refuse d'être appelé hors de son fournisseur", () => {
    // Un toast perdu en silence serait pire qu'un plantage : le geste semblerait sans effet.
    expect(() => render(<Trigger tone="info" message="x" />)).toThrow(
      "[toast] useToast() hors ToastProvider",
    );
  });

  /*
    Les échéances, sous faux minuteurs. Limités à `setTimeout`/`clearTimeout` : le planificateur de
    React passe par d'autres primitives, qui fausseraient `getTimerCount()`. Et `fireEvent` plutôt
    que `user` : ce dernier attend des tours de boucle que les faux minuteurs ne rendent pas.
  */
  describe("échéance", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function showToast(tone: Tone, message: string) {
      const screen = renderWithProviders(<Trigger tone={tone} message={message} />);
      fireEvent.click(screen.getByRole("button", { name: "déclencher" }));
      return screen;
    }

    it.each<[Tone, number]>([
      ["success", 5000],
      ["error", 8000],
    ])("se retire seul : un toast %s dure %i ms", (tone, ttl) => {
      // L'erreur reste plus longtemps : elle demande une action.
      const { queryByRole } = showToast(tone, "Message");

      act(() => {
        vi.advanceTimersByTime(ttl - 1);
      });
      expect(queryByRole("button", { name: "Message" })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(queryByRole("button", { name: "Message" })).toBeNull();
    });

    it("désarme l'échéance d'un toast fermé au clic", () => {
      const screen = renderWithProviders(<Trigger tone="info" message="Date recalée" />);
      // Référence prise avant le toast : seul SON minuteur est compté, pas ceux des autres
      // fournisseurs du harnais.
      const idle = vi.getTimerCount();
      fireEvent.click(screen.getByRole("button", { name: "déclencher" }));
      expect(vi.getTimerCount()).toBe(idle + 1);

      fireEvent.click(screen.getByRole("button", { name: "Date recalée" }));

      expect(vi.getTimerCount()).toBe(idle);
    });

    it("ne laisse aucune échéance survivre au démontage du fournisseur", () => {
      // Sans quoi le minuteur tire après la fin du fichier, sur un jsdom démonté (#668).
      const { unmount } = showToast("error", "Échec");
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

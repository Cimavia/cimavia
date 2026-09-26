import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/lib/api";
import { renderWithProviders } from "../../../test/render";
import { CmvFormError } from "./CmvFormError";

describe("CmvFormError", () => {
  it("n'affiche rien tant que rien n'a échoué", () => {
    const { container } = renderWithProviders(<CmvFormError error={null} />);

    // Le conteneur porte aussi la zone des toasts : on vise le paragraphe.
    expect(container.querySelector("p")).toBeNull();
  });

  it("affiche le message de l'API, qui dit déjà quoi corriger", () => {
    const { getByText } = renderWithProviders(
      <CmvFormError error={new ApiError(409, "Cotation déjà nommée ainsi", null)} />,
    );

    expect(getByText("Cotation déjà nommée ainsi")).toBeInTheDocument();
  });

  it("retombe sur le message générique quand l'API n'a rien dit", () => {
    const { getByText } = renderWithProviders(
      <CmvFormError error={new TypeError("Failed to fetch")} />,
    );

    // Réseau coupé : pas de message d'API, mais l'échec se dit quand même.
    expect(getByText("common.error")).toBeInTheDocument();
  });

  it("se tait sur une session perdue", () => {
    const { container } = renderWithProviders(
      <CmvFormError error={new ApiError(401, "Unauthorized", null)} />,
    );

    // La fenêtre de reconnexion en dit la cause ; ce message-ci resterait affiché après (#336).
    expect(container.querySelector("p")).toBeNull();
  });
});

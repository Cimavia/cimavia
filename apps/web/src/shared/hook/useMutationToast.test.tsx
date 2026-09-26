import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/shared/component/CmvToast";
import { ApiError } from "@/shared/lib/api";
import { createTestI18n } from "../../../test/i18n";
import { useMutationToast } from "./useMutationToast";

function setup() {
  const i18n = createTestI18n();
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>{children}</ToastProvider>
    </I18nextProvider>
  );
  return renderHook(() => useMutationToast(), { wrapper }).result;
}

describe("useMutationToast — onError", () => {
  it("affiche le message de l'API, qui dit déjà quoi corriger", () => {
    const toast = setup();

    act(() =>
      toast.current.onError(new ApiError(400, "La date ne tombe pas dans la semaine 2", null)),
    );

    expect(screen.getByText("La date ne tombe pas dans la semaine 2")).toBeInTheDocument();
  });

  it("retombe sur le message générique quand l'API n'en donne pas", () => {
    const toast = setup();

    act(() => toast.current.onError(new TypeError("Failed to fetch")));

    expect(screen.getByText("common.error")).toBeInTheDocument();
  });

  it("se tait sur un 401", () => {
    const toast = setup();

    act(() => toast.current.onError(new ApiError(401, "Unauthorized", null)));

    // La fenêtre de reconnexion nomme déjà la cause (#336) : le « Unauthorized » brut de l'API
    // n'y ajouterait qu'un message illisible, en anglais, par-dessus.
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
    expect(screen.queryByText("common.error")).not.toBeInTheDocument();
  });
});

describe("useMutationToast — onFailure", () => {
  it("dit l'échec du geste par son propre message", () => {
    const toast = setup();

    act(() =>
      toast.current.onFailure(
        "library.builder.saveFailed",
        new ApiError(400, "Le bloc 2 est vide", null),
      ),
    );

    // L'enregistrement enchaîne plusieurs appels : le message du dernier tombé ne dirait pas
    // lequel a échoué, celui du geste si. Le détail, lui, reste écrit sous le formulaire.
    expect(screen.getByText("library.builder.saveFailed")).toBeInTheDocument();
  });

  it("se tait sur un 401", () => {
    const toast = setup();

    act(() =>
      toast.current.onFailure(
        "library.builder.saveFailed",
        new ApiError(401, "Unauthorized", null),
      ),
    );

    expect(screen.queryByText("library.builder.saveFailed")).not.toBeInTheDocument();
  });
});

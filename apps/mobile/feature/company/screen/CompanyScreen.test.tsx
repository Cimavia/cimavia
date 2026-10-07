import { Linking } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/feature/account/hook/useLogout";
import { CompanyScreen } from "@/feature/company/screen/CompanyScreen";
import { WEB_URL } from "@/shared/lib/web-url";
import { press, pressButton, renderRn } from "@/test/render";

// L'ordre des gestes de la déconnexion est éprouvé par `ProfileScreen.test.tsx`, à travers le vrai
// hook : seul compte ici que l'écran la déclenche.
const logout = vi.fn(async () => undefined);
vi.mock("@/feature/account/hook/useLogout", () => ({ useLogout: vi.fn() }));

beforeEach(() => {
  vi.mocked(useLogout).mockReturnValue(logout);
});

describe("CompanyScreen", () => {
  it("dit que l'espace est sur le web, et ouvre son adresse", () => {
    const open = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { getByText } = renderRn(<CompanyScreen />);

    expect(getByText("company.mobile.title")).toBeTruthy();
    // L'adresse s'affiche sans protocole, le lien l'emporte.
    press(getByText(WEB_URL.replace(/^https?:\/\//, "")));

    expect(open).toHaveBeenCalledWith(WEB_URL);
  });

  it("laisse se déconnecter", () => {
    const { container } = renderRn(<CompanyScreen />);

    pressButton(container, "common.logout");

    expect(logout).toHaveBeenCalledTimes(1);
  });
});

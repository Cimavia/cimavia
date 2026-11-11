import { describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorMessage } from "./api";
// Le catalogue réel, comme au démarrage de l'app : le test lit le texte, donc que la clé existe.
import "./i18n";

vi.mock("@/shared/lib/auth", () => ({ authClient: { getCookie: () => "" } }));

// La décision, cas par cas, est éprouvée dans `@cmv/shared` ; ici, le câblage au catalogue (#782).
describe("apiErrorMessage", () => {
  it("dit le 429 de la limite de débit en français", () => {
    expect(apiErrorMessage(new ApiError(429, "Trop de requêtes", null))).toBe(
      "Trop de demandes d'affilée. Patiente un instant, puis réessaie.",
    );
  });
});

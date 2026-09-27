import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each([
    ["/feedbacks?feedback=f-1", "le débrief ouvert depuis une notification"],
    ["/library/sessions/s-1", "une page profonde"],
    ["/plans#week-2", "une ancre"],
    ["/", "l'accueil"],
  ])("garde %s (%s)", (target) => {
    expect(safeRedirect(target)).toBe(target);
  });

  it.each([
    ["https://site-piege.example", "une URL absolue"],
    ["//site-piege.example", "une URL sans protocole, lue comme une autre origine"],
    ["/\\site-piege.example", "la même, avec la barre inverse que les navigateurs normalisent"],
    ["javascript:alert(1)", "un script"],
    ["plans", "un chemin relatif"],
    ["", "une cible vide"],
  ])("refuse %s (%s)", (target) => {
    // Chacune ferait de la page de connexion un tremplin vers un site tiers, avec un
    // utilisateur fraîchement authentifié.
    expect(safeRedirect(target)).toBeNull();
  });

  it.each([
    "/login",
    "/login?redirect=/plans",
    "/register",
    "/reset-password?token=t",
  ])("refuse de revenir sur l'écran d'authentification %s", (target) => {
    // Une fois connecté, ces écrans renvoient aussitôt à l'accueil : y revenir serait un saut
    // pour rien, et `/login?redirect=/login…` une boucle.
    expect(safeRedirect(target)).toBeNull();
  });

  it("refuse ce qui n'est pas une chaîne", () => {
    // La valeur vient de l'URL, désérialisée par le routeur : rien ne garantit son type.
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect(42)).toBeNull();
    expect(safeRedirect({ to: "/plans" })).toBeNull();
  });
});

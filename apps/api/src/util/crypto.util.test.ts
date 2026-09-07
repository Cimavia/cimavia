import { describe, expect, it } from "vitest";
import { constantTimeEquals, hashSecret } from "./crypto.util";

describe("hashSecret", () => {
  it("rend une empreinte stable, et jamais le clair", () => {
    const digest = hashSecret("s3cret");

    expect(digest).toBe(hashSecret("s3cret"));
    expect(digest).not.toContain("s3cret");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sépare deux secrets voisins", () => {
    expect(hashSecret("secret")).not.toBe(hashSecret("secrets"));
  });
});

describe("constantTimeEquals", () => {
  it("reconnaît deux secrets identiques", () => {
    expect(constantTimeEquals("meme-secret", "meme-secret")).toBe(true);
  });

  it("refuse deux secrets différents", () => {
    expect(constantTimeEquals("attendu", "fourni")).toBe(false);
  });

  // Le vrai apport de la fonction : `timingSafeEqual` LÈVE sur des tampons de tailles
  // différentes. Sans le hachage préalable, un secret plus court qu'attendu ferait un 500 au
  // lieu d'un refus — et la seule différence de traitement dirait déjà la longueur cherchée.
  it("refuse sans lever quand les longueurs diffèrent", () => {
    expect(constantTimeEquals("court", "beaucoup-plus-long-que-l-autre")).toBe(false);
    expect(constantTimeEquals("", "non-vide")).toBe(false);
  });

  it("compare des empreintes aussi bien que des clairs", () => {
    expect(constantTimeEquals(hashSecret("a"), hashSecret("a"))).toBe(true);
    expect(constantTimeEquals(hashSecret("a"), hashSecret("b"))).toBe(false);
  });
});

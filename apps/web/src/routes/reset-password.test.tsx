import { describe, expect, it } from "vitest";
import { parseResetPasswordSearch as parse } from "@/routes/reset-password";

describe("parseResetPasswordSearch", () => {
  it("retient le jeton posé par la redirection de Better Auth", () => {
    expect(parse({ token: "jeton-du-mail" })).toEqual({ token: "jeton-du-mail" });
  });

  it("retient le refus du lien posé à la place du jeton (#437)", () => {
    expect(parse({ error: "INVALID_TOKEN" })).toEqual({ error: "INVALID_TOKEN" });
  });

  it("ramène toute autre erreur au refus du lien, sans recopier ce que dit l'URL", () => {
    expect(parse({ error: "TOKEN_EXPIRED" })).toEqual({ error: "INVALID_TOKEN" });
    expect(parse({ error: 42 })).toEqual({ error: "INVALID_TOKEN" });
  });

  it("garde le jeton à côté d'une erreur, pour que l'écran l'ôte quand même de l'URL", () => {
    // Better Auth ne pose jamais les deux : une telle URL est fabriquée. Le lien y est mort, mais
    // le jeton ne doit pas rester dans la barre d'adresse pour autant (#335).
    expect(parse({ token: "jeton-du-mail", error: "INVALID_TOKEN" })).toEqual({
      token: "jeton-du-mail",
      error: "INVALID_TOKEN",
    });
  });

  it("retient le succès que l'écran y pose, lu comme du JSON par le routeur", () => {
    expect(parse({ done: true })).toEqual({ done: true });
    // Une valeur restée textuelle ou autre n'est pas celle que l'écran pose.
    expect(parse({ done: "true" })).toEqual({});
    expect(parse({ done: 1 })).toEqual({});
    // Jamais à côté d'un jeton ou d'une erreur : l'écran ne les pose pas ensemble.
    expect(parse({ done: true, token: "jeton-du-mail" })).toEqual({ token: "jeton-du-mail" });
    expect(parse({ done: true, error: "INVALID_TOKEN" })).toEqual({ error: "INVALID_TOKEN" });
  });

  it("ne retient rien d'autre, ni un jeton ou une erreur vides, ni un jeton malformé", () => {
    // Sans jeton, l'écran dit qu'il manque : un `token` vide ou non textuel n'en est pas un, et
    // l'écran n'aurait rien à retirer de l'URL.
    expect(parse({})).toEqual({});
    expect(parse({ token: "", error: "" })).toEqual({});
    expect(parse({ token: 42, other: "x" })).toEqual({});
  });
});

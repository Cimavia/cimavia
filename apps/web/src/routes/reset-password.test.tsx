import { describe, expect, it } from "vitest";
import { parseResetPasswordSearch as parse } from "@/routes/reset-password";

describe("parseResetPasswordSearch", () => {
  it("retient le jeton posé par la redirection de Better Auth", () => {
    expect(parse({ token: "jeton-du-mail" })).toEqual({ token: "jeton-du-mail" });
  });

  it("ne retient rien d'autre, ni un jeton vide ou malformé", () => {
    // Sans jeton, l'écran le dit à l'envoi : un `token` vide ou non textuel n'en est pas un, et
    // l'écran n'aurait rien à retirer de l'URL.
    expect(parse({})).toEqual({});
    expect(parse({ token: "" })).toEqual({});
    expect(parse({ token: 42, error: "INVALID_TOKEN" })).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import {
  installationSecretSchema,
  isExpoPushToken,
  PushPlatform,
  pushTokenDtoSchema,
  registerPushTokenSchema,
} from "./push-token.schema";

describe("registerPushTokenSchema", () => {
  it("accepte les deux orthographes du token Expo", () => {
    for (const token of ["ExponentPushToken[abc123]", "ExpoPushToken[abc123]"]) {
      const result = registerPushTokenSchema.safeParse({ token, platform: PushPlatform.IOS });
      expect(result.success).toBe(true);
    }
  });

  it("refuse un token qui ne pourrait jamais être livré", () => {
    const result = registerPushTokenSchema.safeParse({
      token: "pas-un-token",
      platform: PushPlatform.ANDROID,
    });
    expect(result.success).toBe(false);
  });

  it("refuse une plateforme inconnue", () => {
    const result = registerPushTokenSchema.safeParse({
      token: "ExponentPushToken[abc123]",
      platform: "WEB",
    });
    expect(result.success).toBe(false);
  });
});

describe("registerPushTokenSchema — secret d'installation (#90)", () => {
  const base = { token: "ExponentPushToken[abc123]", platform: PushPlatform.IOS };

  // Sans ça, la bêta perdrait ses notifications le temps de mettre l'app à jour.
  it("laisse passer une installation qui n'a pas encore de secret", () => {
    expect(registerPushTokenSchema.safeParse(base).success).toBe(true);
  });

  it("accepte le secret qu'émet l'api", () => {
    const secret = "a".repeat(43);
    const result = registerPushTokenSchema.safeParse({ ...base, installationSecret: secret });

    expect(result.success).toBe(true);
  });

  // Un secret trop court se force ; un secret bavard sert à autre chose qu'à s'identifier.
  it("refuse un secret hors bornes ou hors alphabet", () => {
    for (const installationSecret of ["trop-court", "a".repeat(129), `${"a".repeat(40)}=+/`]) {
      expect(registerPushTokenSchema.safeParse({ ...base, installationSecret }).success).toBe(
        false,
      );
    }
  });

  it("refuse un secret vide plutôt que de le confondre avec l'absence de secret", () => {
    expect(registerPushTokenSchema.safeParse({ ...base, installationSecret: "" }).success).toBe(
      false,
    );
  });
});

describe("installationSecretSchema", () => {
  it("accepte le base64url d'un tirage de 32 octets", () => {
    expect(installationSecretSchema.safeParse("Zm9vYmFy-_0123456789abcdefghijklmnop").success).toBe(
      true,
    );
  });
});

describe("pushTokenDtoSchema", () => {
  const base = {
    id: "ck1",
    token: "ExponentPushToken[abc123]",
    platform: PushPlatform.ANDROID,
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
  };

  // `null` dit « rien de neuf à ranger », pas « pas de secret » : le champ doit être PRÉSENT,
  // sinon un client ne saurait pas distinguer une api muette d'une api qui n'a rien réémis.
  it("exige le secret, fût-il nul", () => {
    expect(pushTokenDtoSchema.safeParse({ ...base, installationSecret: null }).success).toBe(true);
    expect(pushTokenDtoSchema.safeParse({ ...base, installationSecret: "s" }).success).toBe(true);
    expect(pushTokenDtoSchema.safeParse(base).success).toBe(false);
  });
});

describe("isExpoPushToken", () => {
  it("reconnaît un token valide et rejette une chaîne vide entre crochets", () => {
    expect(isExpoPushToken("ExponentPushToken[xxx]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
  });
});

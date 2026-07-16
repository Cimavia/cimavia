import { describe, expect, it } from "vitest";
import { isExpoPushToken, PushPlatform, registerPushTokenSchema } from "./push-token.schema";

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

describe("isExpoPushToken", () => {
  it("reconnaît un token valide et rejette une chaîne vide entre crochets", () => {
    expect(isExpoPushToken("ExponentPushToken[xxx]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
  });
});

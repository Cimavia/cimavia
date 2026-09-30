import { PushPlatform } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPushToken, revokePushToken } from "@/feature/notification/api";
import { api } from "@/shared/lib/api";

// Le client HTTP seul est remplacé : ce qui est vérifié, c'est la route que l'appareil vise.
vi.mock("@/shared/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/api")>();
  return { ...original, api: { ...original.api, post: vi.fn(), delete: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.post).mockResolvedValue({ id: "pt-1" });
  vi.mocked(api.delete).mockResolvedValue(undefined);
});

describe("les appareils", () => {
  it("enregistre l'appareil courant", async () => {
    const input = { token: "ExponentPushToken[abc]", platform: PushPlatform.IOS };

    await registerPushToken(input);

    expect(api.post).toHaveBeenCalledWith("/me/push-tokens", input);
  });

  /** Le jeton Expo porte des crochets : non encodé, il casserait le chemin de la révocation. */
  it("révoque l'appareil par son jeton encodé", async () => {
    await revokePushToken("ExponentPushToken[abc]");

    expect(api.delete).toHaveBeenCalledWith("/me/push-tokens/ExponentPushToken%5Babc%5D");
  });
});

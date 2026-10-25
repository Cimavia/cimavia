import { describe, expect, it } from "vitest";
import { describePlaybackError } from "./playback-error.util";

const SIGNED = "https://s3.example.test/bucket/user-1/note.m4a?X-Amz-Signature=abc&X-Amz-Date=1";

describe("describePlaybackError", () => {
  it("donne l'hôte de l'URL jouée", () => {
    expect(describePlaybackError("Response code: 403", SIGNED)).toEqual({
      host: "s3.example.test",
      message: "Response code: 403",
    });
  });

  it("ne laisse de l'URL citée par le natif que son hôte", () => {
    const { message } = describePlaybackError(`Source error: ${SIGNED} (403)`, SIGNED);
    expect(message).toBe("Source error: s3.example.test (403)");
  });

  it("blanchit toute URL du message, pas seulement celle qui jouait", () => {
    const { message } = describePlaybackError("redirigé vers https://autre.test/x?token=1", SIGNED);
    expect(message).toBe("redirigé vers autre.test");
  });

  it("n'invente pas d'hôte pour une URL illisible", () => {
    expect(describePlaybackError("échec", "pas une url")).toEqual({ host: null, message: "échec" });
  });

  it("masque une URL citée sans hôte", () => {
    expect(describePlaybackError("vers http:///x", SIGNED).message).toBe("vers [url]");
  });
});

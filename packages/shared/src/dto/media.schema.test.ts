import { describe, expect, it } from "vitest";
import { isAllowedFeedbackImageMime, isAllowedFeedbackVideoMime } from "./media.schema";

describe("isAllowedFeedbackImageMime", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepte %s", (mime) => {
    expect(isAllowedFeedbackImageMime(mime)).toBe(true);
  });

  // Un SVG porte du script ; un HEIC n'est pas lisible par tous les navigateurs du coach.
  it.each(["image/svg+xml", "image/heic", "video/mp4", ""])("refuse %s", (mime) => {
    expect(isAllowedFeedbackImageMime(mime)).toBe(false);
  });
});

describe("isAllowedFeedbackVideoMime", () => {
  // `quicktime` : ce que l'iPhone produit. Le refuser couperait la vidéo à la moitié des athlètes.
  it.each(["video/mp4", "video/quicktime"])("accepte %s", (mime) => {
    expect(isAllowedFeedbackVideoMime(mime)).toBe(true);
  });

  it.each(["video/webm", "image/jpeg", ""])("refuse %s", (mime) => {
    expect(isAllowedFeedbackVideoMime(mime)).toBe(false);
  });
});

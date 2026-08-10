import { describe, expect, it } from "vitest";
import {
  MAX_FEEDBACK_AUDIOS,
  MAX_FEEDBACK_PHOTOS,
  MAX_FEEDBACK_VIDEOS,
  MediaType,
} from "../dto/feedback.schema";
import { countUnreadFeedbacks, remainingMediaSlots } from "./feedback.util";

describe("countUnreadFeedbacks", () => {
  it("compte les débriefs que le coach n'a pas ouverts", () => {
    const feedbacks = [
      { coachReadAt: null },
      { coachReadAt: "2026-07-29T08:00:00.000Z" },
      { coachReadAt: null },
    ];
    expect(countUnreadFeedbacks(feedbacks)).toBe(2);
  });

  /**
   * LA distinction qui justifie que ce compteur existe au lieu d'un `list.length` : une liste
   * ABSENTE (chargement, panne réseau) rend `null` → « — », tandis qu'une liste vide rend `0`. Les
   * confondre afficherait « rien à relire » sur une API injoignable — le fallback silencieux que la
   * règle nullable interdit.
   */
  it("distingue « je ne sais pas » (null) de « rien à relire » (0)", () => {
    expect(countUnreadFeedbacks(undefined)).toBeNull();
    expect(countUnreadFeedbacks(null)).toBeNull();
    expect(countUnreadFeedbacks([])).toBe(0);
  });

  // Tous lus : le compteur tombe à zéro sans jamais devenir `null` — la donnée est connue.
  it("rend 0 quand tout est lu", () => {
    expect(countUnreadFeedbacks([{ coachReadAt: "2026-07-29T08:00:00.000Z" }])).toBe(0);
  });
});

describe("remainingMediaSlots", () => {
  const photo = { type: MediaType.IMAGE };
  const video = { type: MediaType.VIDEO };

  it("retranche les médias déjà joints, type par type", () => {
    const feedback = { media: [photo, photo, video] };
    expect(remainingMediaSlots(feedback, MediaType.IMAGE)).toBe(MAX_FEEDBACK_PHOTOS - 2);
    expect(remainingMediaSlots(feedback, MediaType.VIDEO)).toBe(MAX_FEEDBACK_VIDEOS - 1);
    expect(remainingMediaSlots(feedback, MediaType.AUDIO)).toBe(MAX_FEEDBACK_AUDIOS);
  });

  /**
   * Pas de débrief = tous les emplacements libres, et c'est un état LÉGITIME, pas une donnée
   * manquante : un débrief média-seul commence forcément par là. D'où un nombre et non `null`.
   */
  it("rend le quota entier quand aucun débrief n'existe encore", () => {
    expect(remainingMediaSlots(null, MediaType.IMAGE)).toBe(MAX_FEEDBACK_PHOTOS);
    expect(remainingMediaSlots(undefined, MediaType.AUDIO)).toBe(MAX_FEEDBACK_AUDIOS);
  });

  // Quota atteint : zéro, pas un négatif — c'est ce que le bouton d'ajout lit pour s'éteindre.
  it("tombe à zéro quand le quota est atteint", () => {
    const media = Array.from({ length: MAX_FEEDBACK_PHOTOS }, () => photo);
    expect(remainingMediaSlots({ media }, MediaType.IMAGE)).toBe(0);
  });
});

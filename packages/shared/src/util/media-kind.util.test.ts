import { describe, expect, it } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import { mediaKindOfMime } from "./media-kind.util";

describe("mediaKindOfMime", () => {
  it("range un fichier dans sa famille de média", () => {
    expect(mediaKindOfMime("image/jpeg")).toBe(MediaType.IMAGE);
    expect(mediaKindOfMime("video/quicktime")).toBe(MediaType.VIDEO);
    expect(mediaKindOfMime("audio/m4a")).toBe(MediaType.AUDIO);
  });

  /**
   * LA distinction qui justifie que cette fonction existe à côté des gardes de liste blanche : un
   * format non géré occupe quand même une place de photo. Le classer ailleurs le ferait préparer
   * comme une vidéo, ou passer entre les quotas sans en consommer aucun.
   */
  it("classe un format non géré par sa famille, pas par son acceptation", () => {
    expect(mediaKindOfMime("image/heic")).toBe(MediaType.IMAGE);
    expect(mediaKindOfMime("video/webm")).toBe(MediaType.VIDEO);
  });

  // Règle nullable : un type absent ou inconnu ne devient pas une photo par défaut — le rendu doit
  // pouvoir dire « ce fichier n'est pas géré » plutôt que de l'imputer à un quota au hasard.
  it("rend null sur un type inconnu ou absent", () => {
    expect(mediaKindOfMime("application/pdf")).toBeNull();
    expect(mediaKindOfMime("")).toBeNull();
    expect(mediaKindOfMime(null)).toBeNull();
    expect(mediaKindOfMime(undefined)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import { MessageType } from "../dto/message.schema";
import { mediaKindOfMime, messageMediaKindOfMime } from "./media-kind.util";

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

describe("messageMediaKindOfMime", () => {
  it("range le PDF en fichier, et le reste comme le débrief", () => {
    expect(messageMediaKindOfMime("application/pdf")).toBe(MessageType.FILE);
    expect(messageMediaKindOfMime("image/heic")).toBe(MessageType.IMAGE);
    expect(messageMediaKindOfMime("video/mp4")).toBe(MessageType.VIDEO);
    expect(messageMediaKindOfMime("audio/m4a")).toBe(MessageType.AUDIO);
  });

  // Le fichier se reconnaît à la liste, pas à la famille : un tableur n'occupe aucune place pour se
  // faire refuser au format ensuite, il est « pas géré » d'emblée.
  it("rend null sur un fichier hors liste, ou un type absent", () => {
    expect(messageMediaKindOfMime("application/zip")).toBeNull();
    expect(messageMediaKindOfMime(null)).toBeNull();
    expect(messageMediaKindOfMime(undefined)).toBeNull();
  });
});

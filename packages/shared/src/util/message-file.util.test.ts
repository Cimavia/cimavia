import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_FILE_SIZE_BYTES } from "../dto/message.schema";
import { megabytesOf } from "./media-format.util";
import { checkMessageFile } from "./message-file.util";

describe("checkMessageFile", () => {
  it("laisse partir un PDF lisible sous le plafond", () => {
    expect(checkMessageFile("application/pdf", MAX_MESSAGE_FILE_SIZE_BYTES)).toEqual({
      accepted: true,
      mimeType: "application/pdf",
      size: MAX_MESSAGE_FILE_SIZE_BYTES,
    });
  });

  it("refuse ce qui n'est pas un PDF, avant même sa taille", () => {
    expect(checkMessageFile("application/zip", 0)).toEqual({
      accepted: false,
      reasonKey: "messages.media.unsupported",
      params: {},
    });
  });

  // Un fournisseur qui ne laisse pas lire rend 0 ou rien : ce n'est pas un fichier vide à signer.
  it.each([0, null])("dit illisible un fichier dont la taille vaut %s", (size) => {
    expect(checkMessageFile("application/pdf", size)).toMatchObject({
      accepted: false,
      reasonKey: "messages.media.unreadable",
    });
  });

  it("refuse au-delà du plafond, et dit le plafond en Mo", () => {
    expect(checkMessageFile("application/pdf", MAX_MESSAGE_FILE_SIZE_BYTES + 1)).toEqual({
      accepted: false,
      reasonKey: "messages.media.fileTooBig",
      params: { max: megabytesOf(MAX_MESSAGE_FILE_SIZE_BYTES) },
    });
  });
});

import { describe, expect, it } from "vitest";
import { requestMessageUploadUrlSchema } from "../dto/message.schema";
import { messageUploadInput } from "./message-upload.util";

describe("messageUploadInput", () => {
  it("décrit un PDF sans durée, et sans ce qui le porte", () => {
    const pdf = {
      type: "FILE" as const,
      uri: "file:///cache/DocumentPicker/plan.pdf",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      size: 2_048,
    };

    const input = messageUploadInput(pdf);

    expect(input).toEqual({
      type: "FILE",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      size: 2_048,
    });
    // Le schéma est strict : l'`uri` recopiée l'aurait fait refuser.
    expect(requestMessageUploadUrlSchema.safeParse(input).success).toBe(true);
  });

  it("garde la durée d'une vidéo", () => {
    const input = messageUploadInput({
      type: "VIDEO",
      fileName: "squat.mp4",
      mimeType: "video/mp4",
      size: 4_096,
      durationSeconds: 12,
    });

    expect(input).toMatchObject({ type: "VIDEO", durationSeconds: 12 });
    expect(requestMessageUploadUrlSchema.safeParse(input).success).toBe(true);
  });
});

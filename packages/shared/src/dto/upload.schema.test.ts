import { describe, expect, it } from "vitest";
import {
  completeMultipartUploadSchema,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  mediaUploadTicketDtoSchema,
  multipartPartCount,
  multipartPartRange,
  requiresMultipart,
  S3_MAX_PART_COUNT,
  S3_MIN_PART_SIZE_BYTES,
  UploadMode,
} from "./upload.schema";

describe("bornes du découpage", () => {
  it("garde une part au-dessus du plancher S3 et un seuil sous le plafond du bord", () => {
    // Ces deux invariants ne sont pas décoratifs : sous 5 Mio le storage refuse toute part non
    // finale, et au-delà de 100 Mo le bord Cloudflare renvoie 413 (mesuré).
    expect(MULTIPART_PART_SIZE_BYTES).toBeGreaterThanOrEqual(S3_MIN_PART_SIZE_BYTES);
    expect(MULTIPART_THRESHOLD_BYTES).toBeLessThan(100 * 1024 * 1024);
  });

  it("tient le plus gros fichier accepté sous le plafond de parts de S3", () => {
    const largest = multipartPartCount(1000 * 1024 * 1024);
    expect(largest).not.toBeNull();
    expect(largest ?? 0).toBeLessThanOrEqual(S3_MAX_PART_COUNT);
  });
});

describe("requiresMultipart", () => {
  it("laisse le PUT unique au seuil, et découpe au-delà", () => {
    expect(requiresMultipart(MULTIPART_THRESHOLD_BYTES)).toBe(false);
    expect(requiresMultipart(MULTIPART_THRESHOLD_BYTES + 1)).toBe(true);
  });
});

describe("multipartPartCount", () => {
  it("compte une part entamée comme une part", () => {
    expect(multipartPartCount(MULTIPART_PART_SIZE_BYTES)).toBe(1);
    expect(multipartPartCount(MULTIPART_PART_SIZE_BYTES + 1)).toBe(2);
  });

  it("rend null sur une taille qui n'a pas de sens", () => {
    expect(multipartPartCount(0)).toBeNull();
    expect(multipartPartCount(-1)).toBeNull();
    expect(multipartPartCount(1.5)).toBeNull();
  });
});

describe("multipartPartRange", () => {
  const total = MULTIPART_PART_SIZE_BYTES * 2 + 1024;

  it("découpe en plages contiguës, la dernière tronquée à la fin du fichier", () => {
    expect(multipartPartRange(1, total)).toEqual({
      start: 0,
      end: MULTIPART_PART_SIZE_BYTES,
      length: MULTIPART_PART_SIZE_BYTES,
    });
    expect(multipartPartRange(3, total)).toEqual({
      start: MULTIPART_PART_SIZE_BYTES * 2,
      end: total,
      length: 1024,
    });
  });

  it("couvre le fichier entier, sans trou ni recouvrement", () => {
    const count = multipartPartCount(total) ?? 0;
    let covered = 0;
    let previousEnd = 0;
    for (let partNumber = 1; partNumber <= count; partNumber += 1) {
      const range = multipartPartRange(partNumber, total);
      expect(range).not.toBeNull();
      if (range == null) return;
      expect(range.start).toBe(previousEnd);
      covered += range.length;
      previousEnd = range.end;
    }
    expect(covered).toBe(total);
  });

  it("rend null hors plage plutôt qu'une tranche vide", () => {
    expect(multipartPartRange(0, total)).toBeNull();
    expect(multipartPartRange(4, total)).toBeNull();
    expect(multipartPartRange(1.5, total)).toBeNull();
  });
});

describe("mediaUploadTicketDtoSchema", () => {
  it("accepte un ticket SINGLE", () => {
    const ticket = {
      mode: UploadMode.SINGLE,
      storagePath: "athlete/a/feedback/s/x.mp4",
      expiresIn: 300,
      uploadUrl: "https://s3.example.com/bucket/key?signature=abc",
    };
    expect(mediaUploadTicketDtoSchema.safeParse(ticket).success).toBe(true);
  });

  it("accepte un ticket MULTIPART", () => {
    const ticket = {
      mode: UploadMode.MULTIPART,
      storagePath: "athlete/a/feedback/s/x.mp4",
      expiresIn: 300,
      uploadId: "upload-1",
      partSize: MULTIPART_PART_SIZE_BYTES,
      partUrls: ["https://s3.example.com/bucket/key?partNumber=1"],
    };
    expect(mediaUploadTicketDtoSchema.safeParse(ticket).success).toBe(true);
  });

  it("refuse un MULTIPART sans part : il n'y aurait rien à envoyer", () => {
    const ticket = {
      mode: UploadMode.MULTIPART,
      storagePath: "athlete/a/feedback/s/x.mp4",
      expiresIn: 300,
      uploadId: "upload-1",
      partSize: MULTIPART_PART_SIZE_BYTES,
      partUrls: [],
    };
    expect(mediaUploadTicketDtoSchema.safeParse(ticket).success).toBe(false);
  });

  it("refuse un SINGLE portant les champs du multipart (modes non mélangeables)", () => {
    const ticket = {
      mode: UploadMode.SINGLE,
      storagePath: "athlete/a/feedback/s/x.mp4",
      expiresIn: 300,
      uploadId: "upload-1",
    };
    expect(mediaUploadTicketDtoSchema.safeParse(ticket).success).toBe(false);
  });
});

describe("completeMultipartUploadSchema", () => {
  it("refuse un champ inconnu — notamment des ETags que le client n'a pas à fournir", () => {
    const result = completeMultipartUploadSchema.safeParse({
      storagePath: "athlete/a/feedback/s/x.mp4",
      uploadId: "upload-1",
      parts: [{ partNumber: 1, eTag: "abc" }],
    });
    expect(result.success).toBe(false);
  });
});

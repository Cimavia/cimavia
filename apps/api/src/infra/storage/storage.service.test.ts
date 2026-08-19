import type { EnvSchema } from "@cmv/shared";
import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { MULTIPART_SIGNED_URL_TTL_SECONDS, StorageService } from "./storage.service";

// ConfigService réduit à ce que lit StorageService : un getteur sur les variables S3_*.
function configWith(values: Record<string, string>): ConfigService<EnvSchema, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<EnvSchema, true>;
}

const FULL_CONFIG = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "bucket-test",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: "true",
};

/**
 * Fail-closed du storage : l'API doit DÉMARRER sans configuration S3 (les autres features
 * fonctionnent), mais toute opération de storage doit alors échouer explicitement en 503 —
 * jamais silencieusement.
 */
describe("StorageService — storage non configuré", () => {
  it("se construit sans lever, mais se déclare non configuré", () => {
    const storage = new StorageService(configWith({}));
    expect(storage.isConfigured).toBe(false);
  });

  it("répond 503 sur upload, download et suppression", async () => {
    const storage = new StorageService(configWith({}));
    await expect(storage.createUploadUrl("k", "image/jpeg")).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(storage.createDownloadUrl("k")).rejects.toThrow(ServiceUnavailableException);
    await expect(storage.deleteObject("k")).rejects.toThrow(ServiceUnavailableException);
  });

  it("répond 503 sur les quatre étapes d'un upload découpé", async () => {
    const storage = new StorageService(configWith({}));
    await expect(storage.createMultipartUpload("k", "video/mp4")).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(storage.createPartUploadUrls("k", "u", [1024])).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(storage.completeMultipartUpload("k", "u", 1)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(storage.abortMultipartUpload("k", "u")).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  // Les cinq variables vont ensemble : une config partielle est une erreur de déploiement, pas
  // un demi-storage. Mieux vaut un 503 franc qu'un client S3 qui échoue à l'exécution.
  it("considère une configuration partielle comme absente", () => {
    const partial = { ...FULL_CONFIG, S3_SECRET_ACCESS_KEY: "" };
    expect(new StorageService(configWith(partial)).isConfigured).toBe(false);
  });
});

describe("StorageService — storage configuré", () => {
  it("signe une URL d'upload portant la taille attendue", async () => {
    const storage = new StorageService(configWith(FULL_CONFIG));
    expect(storage.isConfigured).toBe(true);

    const url = await storage.createUploadUrl("media.mp4", "video/mp4", 300, 1024);
    // La taille entre dans la signature : le storage rejettera un envoi d'un autre poids.
    expect(url).toContain("content-length");
    expect(url).toContain("X-Amz-Expires=300");
  });

  it("signe une URL par part, numérotée à partir de 1 et portant sa propre taille", async () => {
    const storage = new StorageService(configWith(FULL_CONFIG));
    const urls = await storage.createPartUploadUrls("media.mp4", "upload-1", [2048, 1024]);

    expect(urls).toHaveLength(2);
    // `PartNumber` est 1-based côté S3 : un décalage ici produirait un objet recollé à l'envers.
    expect(urls[0]).toContain("partNumber=1");
    expect(urls[1]).toContain("partNumber=2");
    for (const url of urls) {
      expect(url).toContain("uploadId=upload-1");
      // Chaque part porte SA taille dans la signature, pas seulement le total annoncé.
      expect(url).toContain("content-length");
    }
  });

  it("laisse aux parts un TTL plus long qu'au PUT unique", async () => {
    const storage = new StorageService(configWith(FULL_CONFIG));
    const [url] = await storage.createPartUploadUrls("media.mp4", "upload-1", [1024]);
    // Sinon la dernière part d'un gros fichier expire pendant que les précédentes montent.
    expect(url).toContain(`X-Amz-Expires=${MULTIPART_SIGNED_URL_TTL_SECONDS}`);
  });
});

import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { EnvSchema } from "@cmv/shared";
import { MULTIPART_THRESHOLD_BYTES } from "@cmv/shared";
import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    await expect(
      storage.assertUploadedAsDeclared("k", { mimeType: "image/jpeg", size: 1 }),
    ).rejects.toThrow(ServiceUnavailableException);
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

  /**
   * L'arbitrage du mode vit ICI et pas dans les services de feature : le débrief et la messagerie
   * ne diffèrent que par la clé objet, et le dupliquer chez chacun aurait dérivé au premier
   * ajustement du seuil.
   */
  describe("createUploadTicket", () => {
    it("rend un ticket SINGLE au seuil — le seuil est inclusif", async () => {
      const storage = new StorageService(configWith(FULL_CONFIG));
      const ticket = await storage.createUploadTicket(
        "media.mp4",
        "video/mp4",
        MULTIPART_THRESHOLD_BYTES,
      );

      expect(ticket.mode).toBe("SINGLE");
      // Le mode dicte la forme : aucun champ de l'autre branche à lire par erreur.
      expect("partUrls" in ticket).toBe(false);
    });

    // La branche MULTIPART n'est PAS testée ici : `CreateMultipartUpload` est un vrai appel au
    // storage, là où la signature d'une URL est purement locale. Elle est couverte de bout en bout
    // par les e2e (débrief et messagerie), qui tournent contre le SILO du docker-compose.
  });

  it("laisse aux parts un TTL plus long qu'au PUT unique", async () => {
    const storage = new StorageService(configWith(FULL_CONFIG));
    const [url] = await storage.createPartUploadUrls("media.mp4", "upload-1", [1024]);
    // Sinon la dernière part d'un gros fichier expire pendant que les précédentes montent.
    expect(url).toContain(`X-Amz-Expires=${MULTIPART_SIGNED_URL_TTL_SECONDS}`);
  });
});

/**
 * Le dialogue avec le storage, réponse par réponse. SILO répond toujours en une page et avec un
 * `UploadId` : ce que ces tests fabriquent — pagination, part sans ETag, upload disparu — est ce
 * qu'un autre fournisseur S3 peut rendre, et que les e2e ne verront jamais.
 */
describe("StorageService — réponses du storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Remplace le transport S3 : chaque commande reçoit la réponse suivante de `replies`. */
  function storageAnswering(...replies: (object | Error)[]) {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    vi.spyOn(S3Client.prototype, "send").mockImplementation((command: object) => {
      sent.push({
        name: command.constructor.name,
        input: (command as { input: Record<string, unknown> }).input,
      });
      const reply = replies.shift();
      return (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)) as never;
    });
    return { storage: new StorageService(configWith(FULL_CONFIG)), sent };
  }

  const noSuchUpload = () => Object.assign(new Error("gone"), { name: "NoSuchUpload" });

  /**
   * Une liste tronquée se suit jusqu'au bout, et les parts se recollent DANS L'ORDRE : une page
   * oubliée donnerait un objet incomplet, un ordre faux un fichier illisible — sans erreur, dans
   * les deux cas.
   */
  it("suit la pagination et recolle les parts triées par numéro", async () => {
    const { storage, sent } = storageAnswering(
      { Parts: [{ PartNumber: 2, ETag: "b" }], IsTruncated: true, NextPartNumberMarker: "2" },
      { Parts: [{ PartNumber: 1, ETag: "a" }], IsTruncated: false },
      {},
    );

    await storage.completeMultipartUpload("media.mp4", "upload-1", 2);

    expect(sent.map((call) => call.name)).toEqual([
      ListPartsCommand.name,
      ListPartsCommand.name,
      CompleteMultipartUploadCommand.name,
    ]);
    expect(sent[0]?.input).not.toHaveProperty("PartNumberMarker");
    expect(sent[1]?.input).toMatchObject({ PartNumberMarker: "2" });
    expect(sent[2]?.input).toEqual({
      Bucket: "bucket-test",
      Key: "media.mp4",
      UploadId: "upload-1",
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: "a" },
          { PartNumber: 2, ETag: "b" },
        ],
      },
    });
  });

  // Une part sans ETag n'est pas montée : la compter clorait un upload auquel il manque un morceau.
  it("ne compte pas une part sans ETag, et refuse alors de clore", async () => {
    const { storage, sent } = storageAnswering({
      Parts: [{ PartNumber: 1, ETag: "a" }, { PartNumber: 2 }],
    });

    await expect(storage.completeMultipartUpload("media.mp4", "upload-1", 2)).rejects.toEqual(
      new ConflictException("Upload incomplet : 1 part(s) reçue(s) sur 2 attendue(s)"),
    );
    expect(sent.map((call) => call.name)).toEqual([ListPartsCommand.name]);
  });

  it("lit une page sans parts comme un upload vide", async () => {
    const { storage } = storageAnswering({});

    await expect(storage.completeMultipartUpload("media.mp4", "upload-1", 1)).rejects.toThrow(
      "Upload incomplet : 0 part(s) reçue(s) sur 1 attendue(s)",
    );
  });

  /**
   * Upload abandonné, expiré ou déjà clos : une situation NORMALE pour le client, qui réessaie.
   * Un 404 le dit ; l'erreur brute ferait un 500 et chercher une panne serveur.
   */
  it("répond 404 sur un upload que le storage ne connaît plus", async () => {
    const { storage } = storageAnswering(noSuchUpload());

    await expect(storage.completeMultipartUpload("media.mp4", "upload-1", 1)).rejects.toEqual(
      new NotFoundException("Upload découpé introuvable (abandonné ou expiré)"),
    );
  });

  // Toute autre panne reste ce qu'elle est : la maquiller en 404 cacherait un storage en panne.
  it("laisse remonter une autre panne telle quelle", async () => {
    const outage = new Error("connect ECONNREFUSED");
    const { storage } = storageAnswering(outage);

    await expect(storage.completeMultipartUpload("media.mp4", "upload-1", 1)).rejects.toBe(outage);
  });

  /**
   * Le rattachement redit le type et la taille du ticket : le storage, qui a reçu l'objet, tranche.
   * Une réponse muette sur l'un des deux ne prouve rien — elle diverge, plutôt que de passer.
   */
  describe("assertUploadedAsDeclared", () => {
    const declared = { mimeType: "application/pdf", size: 2048 };

    it("laisse passer l'objet reçu tel que déclaré, relu par sa clé", async () => {
      const { storage, sent } = storageAnswering({
        ContentType: "application/pdf",
        ContentLength: 2048,
      });

      await expect(storage.assertUploadedAsDeclared("doc.pdf", declared)).resolves.toBeUndefined();
      expect(sent).toEqual([
        { name: HeadObjectCommand.name, input: { Bucket: "bucket-test", Key: "doc.pdf" } },
      ]);
    });

    it.each([
      ["une autre taille", { ContentType: "application/pdf", ContentLength: 4096 }],
      ["un autre type", { ContentType: "image/png", ContentLength: 2048 }],
      ["une réponse sans taille", { ContentType: "application/pdf" }],
      ["une réponse sans type", { ContentLength: 2048 }],
    ])("répond 409 sur %s", async (_case, head) => {
      const { storage } = storageAnswering(head);

      await expect(storage.assertUploadedAsDeclared("doc.pdf", declared)).rejects.toEqual(
        new ConflictException(
          "Le fichier envoyé ne correspond pas au type ou à la taille déclarés",
        ),
      );
    });

    // Rattacher avant d'envoyer, ou sans jamais envoyer : la ligne désignerait un objet absent.
    it("répond 404 sur une clé où rien n'a été envoyé", async () => {
      const { storage } = storageAnswering(
        Object.assign(new Error("absent"), { name: "NotFound" }),
      );

      await expect(storage.assertUploadedAsDeclared("doc.pdf", declared)).rejects.toEqual(
        new NotFoundException("Aucun fichier n'a été envoyé à ce chemin de storage"),
      );
    });

    it("laisse remonter une autre panne telle quelle", async () => {
      const outage = new Error("connect ECONNREFUSED");
      const { storage } = storageAnswering(outage);

      await expect(storage.assertUploadedAsDeclared("doc.pdf", declared)).rejects.toBe(outage);
    });
  });

  it("répond 503 quand le storage ouvre un upload sans identifiant", async () => {
    const { storage, sent } = storageAnswering({});

    await expect(storage.createMultipartUpload("media.mp4", "video/mp4")).rejects.toEqual(
      new ServiceUnavailableException("Le storage n'a pas ouvert d'upload découpé"),
    );
    expect(sent).toEqual([
      {
        name: CreateMultipartUploadCommand.name,
        input: { Bucket: "bucket-test", Key: "media.mp4", ContentType: "video/mp4" },
      },
    ]);
  });
});

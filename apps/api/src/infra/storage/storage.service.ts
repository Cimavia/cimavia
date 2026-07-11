import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EnvSchema } from "@cmv/shared";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Durée de validité par défaut des URLs signées (secondes). Courte : l'URL n'est qu'un
// ticket d'accès ponctuel (upload direct ou lecture), régénéré à chaque requête.
export const SIGNED_URL_TTL_SECONDS = 300;

type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

/**
 * Accès à l'object storage S3 (Scaleway en MVP) : buckets PRIVÉS, jamais d'accès direct.
 * Le binaire ne transite jamais par l'API — le client PUT/GET directement sur S3 via des
 * URLs signées délivrées ici (CDC §10). Non configuré → 503 (l'API démarre quand même).
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(config: ConfigService<EnvSchema, true>) {
    const s3 = StorageService.readConfig(config);
    if (s3 == null) {
      this.client = null;
      this.bucket = null;
      return;
    }
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
      // MinIO local (endpoint sans DNS de sous-domaine) → path-style ; Scaleway → virtual-hosted.
      forcePathStyle: s3.forcePathStyle,
    });
    this.bucket = s3.bucket;
  }

  // Les 5 variables doivent être toutes présentes, sinon le storage est considéré désactivé.
  private static readConfig(config: ConfigService<EnvSchema, true>): S3Config | null {
    const endpoint = config.get("S3_ENDPOINT", { infer: true });
    const region = config.get("S3_REGION", { infer: true });
    const bucket = config.get("S3_BUCKET", { infer: true });
    const accessKeyId = config.get("S3_ACCESS_KEY_ID", { infer: true });
    const secretAccessKey = config.get("S3_SECRET_ACCESS_KEY", { infer: true });
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      return null;
    }
    const forcePathStyle = config.get("S3_FORCE_PATH_STYLE", { infer: true }) === "true";
    return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle };
  }

  get isConfigured(): boolean {
    return this.client != null;
  }

  private require(): { client: S3Client; bucket: string } {
    if (this.client == null || this.bucket == null) {
      throw new ServiceUnavailableException(
        "Object storage non configuré (variables S3_* manquantes)",
      );
    }
    return { client: this.client, bucket: this.bucket };
  }

  // URL PUT signée : le client uploade directement le fichier vers S3 (jamais via l'API).
  async createUploadUrl(
    key: string,
    contentType: string,
    ttl = SIGNED_URL_TTL_SECONDS,
  ): Promise<string> {
    const { client, bucket } = this.require();
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return getSignedUrl(client, command, { expiresIn: ttl });
  }

  // URL GET signée : lecture ponctuelle d'un objet privé.
  async createDownloadUrl(key: string, ttl = SIGNED_URL_TTL_SECONDS): Promise<string> {
    const { client, bucket } = this.require();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: ttl });
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

import {
  AbortMultipartUploadCommand,
  type CompletedPart,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EnvSchema, MediaUploadTicketDto } from "@cmv/shared";
import {
  MULTIPART_PART_SIZE_BYTES,
  multipartPartSizes,
  requiresMultipart,
  UploadMode,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Durée de validité par défaut des URLs signées (secondes). Courte : l'URL n'est qu'un
// ticket d'accès ponctuel (upload direct ou lecture), régénéré à chaque requête.
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * TTL des URLs de parts — nettement plus long, et ce n'est pas du confort.
 *
 * Toutes les parts sont signées EN UNE FOIS à l'ouverture de l'upload, mais envoyées
 * séquentiellement. La dernière doit donc rester valide le temps que toutes les précédentes soient
 * montées : à ~5 Mo/s (débit mesuré depuis un mobile à travers le tunnel), 1 Go prend plus de trois
 * minutes — les 300 s du PUT unique expireraient en cours de route, et l'athlète verrait échouer un
 * envoi presque terminé. Une heure couvre un gros fichier sur une 4G médiocre depuis une salle.
 */
export const MULTIPART_SIGNED_URL_TTL_SECONDS = 3600;

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

  /**
   * URL PUT signée : le client uploade directement le fichier vers S3 (jamais via l'API).
   *
   * `contentLength` fait entrer la taille dans la SIGNATURE : le storage rejette alors un envoi
   * dont le poids diffère de celui annoncé à l'API. Sans elle, un client pourrait déclarer 10 Mo,
   * obtenir son URL et pousser 2 Go — le plafond du schéma ne serait qu'une politesse. Le client
   * doit donc envoyer exactement `Content-Length: contentLength`.
   */
  async createUploadUrl(
    key: string,
    contentType: string,
    ttl = SIGNED_URL_TTL_SECONDS,
    contentLength?: number,
  ): Promise<string> {
    const { client, bucket } = this.require();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(client, command, { expiresIn: ttl });
  }

  /**
   * Comment envoyer `sizeBytes` octets vers `key` — l'arbitrage du MODE et la signature qui va avec.
   *
   * Écrit ICI et nulle part ailleurs : le débrief et la messagerie ne diffèrent que par la clé
   * objet qu'ils fabriquent, et l'arbitrage dupliqué chez chacun aurait dérivé au premier
   * ajustement du seuil.
   *
   * Le mode ne dépend QUE de la taille, et le client n'a pas voix au chapitre : le seuil traduit
   * une contrainte d'infrastructure (le bord réseau refuse tout corps de plus de 100 Mo), pas une
   * préférence.
   */
  async createUploadTicket(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<MediaUploadTicketDto> {
    if (!requiresMultipart(sizeBytes)) {
      const uploadUrl = await this.createUploadUrl(
        key,
        contentType,
        SIGNED_URL_TTL_SECONDS,
        sizeBytes,
      );
      return {
        mode: UploadMode.SINGLE,
        uploadUrl,
        storagePath: key,
        expiresIn: SIGNED_URL_TTL_SECONDS,
      };
    }

    const partSizes = multipartPartSizes(sizeBytes);
    // Inatteignable : les schémas bornent déjà `size` à un entier positif. On refuse franchement
    // plutôt que d'ouvrir un upload sans part, qui ne pourrait jamais être clos.
    if (partSizes == null) {
      throw new BadRequestException("Taille de fichier inexploitable");
    }

    const uploadId = await this.createMultipartUpload(key, contentType);
    const partUrls = await this.createPartUploadUrls(key, uploadId, partSizes);
    return {
      mode: UploadMode.MULTIPART,
      storagePath: key,
      expiresIn: MULTIPART_SIGNED_URL_TTL_SECONDS,
      uploadId,
      partSize: MULTIPART_PART_SIZE_BYTES,
      partUrls,
    };
  }

  /**
   * Ouvre un upload découpé et rend son identifiant. Rien n'est visible dans le bucket tant que
   * `completeMultipartUpload` n'a pas recollé les parts : un upload ouvert puis oublié ne produit
   * aucun objet — seulement des parts facturées, d'où `abortMultipartUpload`.
   */
  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const { client, bucket } = this.require();
    const result = await client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    );
    // Le SDK type `UploadId` comme optionnel. Sans lui, aucune part ne peut être signée : on
    // échoue ici plutôt que de propager un `undefined` qui casserait trois appels plus loin.
    if (result.UploadId == null) {
      throw new ServiceUnavailableException("Le storage n'a pas ouvert d'upload découpé");
    }
    return result.UploadId;
  }

  /**
   * Une URL PUT signée par part, dans l'ordre : l'URL d'indice `i` signe la part `i + 1`.
   *
   * Chaque taille entre dans SA signature, exactement comme pour le PUT unique — le storage
   * refuse alors une part d'un autre poids. C'est ce qui rend les plafonds opposables plutôt que
   * déclaratifs, part par part et pas seulement sur le total annoncé.
   */
  async createPartUploadUrls(
    key: string,
    uploadId: string,
    partSizes: readonly number[],
    ttl = MULTIPART_SIGNED_URL_TTL_SECONDS,
  ): Promise<string[]> {
    const { client, bucket } = this.require();
    return Promise.all(
      partSizes.map((size, index) =>
        getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: index + 1,
            ContentLength: size,
          }),
          { expiresIn: ttl },
        ),
      ),
    );
  }

  /**
   * Recolle les parts en UN objet. Les ETags sont relus par `ListParts` côté serveur plutôt que
   * fournis par le client (cf. `upload.schema.ts` — MinIO n'expose pas l'en-tête `ETag` en CORS).
   *
   * `expectedPartCount` n'est pas une ceinture de sécurité optionnelle : S3 recolle SANS BRONCHER
   * ce qu'on lui donne. Une part manquante produirait une vidéo tronquée, parfaitement valide aux
   * yeux du storage et rattachée comme si de rien n'était. On refuse donc de clore un upload
   * incomplet — sans l'abandonner pour autant, afin que le client puisse renvoyer la part perdue
   * et rappeler `complete`.
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    expectedPartCount: number,
  ): Promise<void> {
    const { client, bucket } = this.require();
    const parts = await this.listParts(key, uploadId);
    if (parts.length !== expectedPartCount) {
      throw new ConflictException(
        `Upload incomplet : ${parts.length} part(s) reçue(s) sur ${expectedPartCount} attendue(s)`,
      );
    }
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  /**
   * Abandonne un upload découpé et purge ses parts. À appeler dès qu'on renonce : les parts d'un
   * upload jamais clos restent facturées SANS apparaître à l'inventaire du bucket — invisibles,
   * donc jamais nettoyées à la main.
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(
      new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
    );
  }

  /**
   * Les parts réellement montées, triées par numéro.
   *
   * Paginé bien que nos fichiers tiennent en ~100 parts (une page en compte 1000) : le jour où la
   * taille de part baisse, une troncature silencieuse produirait ici un objet incomplet — le pire
   * mode de défaillance possible, puisqu'il ne lève rien. Le tri explicite pour la même raison :
   * S3 rend les parts dans l'ordre, `CompleteMultipartUpload` l'EXIGE, et rien ne le garantit
   * dans le contrat.
   */
  private async listParts(key: string, uploadId: string): Promise<CompletedPart[]> {
    const { client, bucket } = this.require();
    const parts: CompletedPart[] = [];
    let marker: string | undefined;

    do {
      // Un upload abandonné, expiré, ou déjà clos n'existe plus : le storage lève `NoSuchUpload`.
      // C'est une situation NORMALE côté client (il réessaie après un abandon, ou après le délai
      // de rétention du bucket) — un 404 le dit, là où l'erreur brute donnerait un 500 qui
      // ferait chercher une panne serveur.
      const page = await client
        .send(
          new ListPartsCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            ...(marker != null && { PartNumberMarker: marker }),
          }),
        )
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "NoSuchUpload") {
            throw new NotFoundException("Upload découpé introuvable (abandonné ou expiré)");
          }
          throw error;
        });
      for (const part of page.Parts ?? []) {
        if (part.PartNumber != null && part.ETag != null) {
          parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
        }
      }
      marker = page.IsTruncated === true ? page.NextPartNumberMarker : undefined;
    } while (marker != null);

    return parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
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

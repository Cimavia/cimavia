import { randomUUID } from "node:crypto";
import type {
  AttachFeedbackMediaInput,
  FeedbackMediaDto,
  MediaTypeType,
  RequestFeedbackUploadUrlInput,
  UploadUrlDto,
} from "@cmv/shared";
import { MediaType, maxFeedbackMediaCount } from "@cmv/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { SIGNED_URL_TTL_SECONDS, StorageService } from "../../infra/storage/storage.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toFeedbackMediaDto } from "../feedback.mapper";
import { FeedbackService } from "./feedback.service";

/**
 * Photos / vidéos d'un débrief (CDC §5.6, §10). Même flux que les documents de la bibliothèque :
 * URL PUT signée → upload direct du client vers le storage → rattachement. Le binaire ne transite
 * jamais par l'API.
 *
 * Différence avec un document : un média n'est JAMAIS copié ni partagé (une planif copie les
 * documents du coach en partageant leur clé objet ; un débrief appartient à l'athlète seul). Sa
 * clé n'appartient donc qu'à lui, et sa suppression purge l'objet sans garde de comptage.
 */
@Injectable()
export class FeedbackMediaService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly feedback: FeedbackService,
    // Garde « séance de l'athlète courant, dans un cycle PUBLISHED » — source unique (P3).
    private readonly athletePlans: AthletePlanService,
  ) {}

  /**
   * Étape 1 : URL PUT signée. Mime, taille et durée sont validés en amont par le schéma
   * (@cmv/shared) ; le quota, lui, dépend de l'état en base — on le vérifie ICI plutôt qu'au
   * rattachement seul, pour ne pas laisser l'athlète uploader 50 Mo avant de lui dire non.
   *
   * Aucun débrief n'est créé à cette étape : demander une URL n'est pas débriefer (sinon une
   * capture abandonnée marquerait la séance DONE). C'est le rattachement qui engage.
   */
  async createUploadUrl(
    scheduledSessionId: string,
    input: RequestFeedbackUploadUrlInput,
  ): Promise<UploadUrlDto> {
    const session = await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    await this.assertQuotaLeft(scheduledSessionId, input.type);

    const storagePath = buildMediaKey(session.athleteId, scheduledSessionId, input.fileName);
    const uploadUrl = await this.storage.createUploadUrl(
      storagePath,
      input.mimeType,
      SIGNED_URL_TTL_SECONDS,
      input.size,
    );
    return { uploadUrl, storagePath, expiresIn: SIGNED_URL_TTL_SECONDS };
  }

  /**
   * Étape 2 : rattacher le média uploadé. Crée le débrief s'il n'existe pas encore — un débrief
   * peut n'être que des photos — et repasse donc la séance en DONE.
   */
  async attach(
    scheduledSessionId: string,
    input: AttachFeedbackMediaInput,
  ): Promise<FeedbackMediaDto> {
    const feedback = await this.feedback.getOrCreateWritable(scheduledSessionId);
    // Revérifié après l'upload : entre la demande d'URL et le rattachement, l'athlète a pu en
    // attacher d'autres depuis un second appareil.
    await this.assertQuotaLeft(scheduledSessionId, input.type);

    // athleteId injecté par le tenancy layer ; coachId repris du débrief (jamais du client).
    const data: Omit<Prisma.FeedbackMediaUncheckedCreateInput, "athleteId"> = {
      coachId: feedback.coachId,
      sessionFeedbackId: feedback.id,
      type: input.type,
      storagePath: input.storagePath,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.size,
      durationSeconds: input.type === MediaType.VIDEO ? input.durationSeconds : null,
    };
    const media = await this.db.feedbackMedia.create({
      data: data as Prisma.FeedbackMediaUncheckedCreateInput,
    });
    return toFeedbackMediaDto(media, this.storage);
  }

  async remove(scheduledSessionId: string, mediaId: string): Promise<void> {
    await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const media = await this.db.feedbackMedia.findFirst({
      where: { id: mediaId, sessionFeedback: { scheduledSessionId } },
    });
    if (media == null) {
      throw new NotFoundException("Média introuvable");
    }

    // L'objet d'abord, la ligne ensuite : un objet orphelin ne coûte que du stockage, une ligne
    // orpheline casserait l'affichage (même arbitrage qu'en bibliothèque — dette P2-5). Pas de
    // garde de comptage : la clé n'est partagée avec personne.
    await this.storage.deleteObject(media.storagePath);
    await this.db.feedbackMedia.delete({ where: { id: mediaId } });
  }

  /**
   * Plafond par type : 3 vidéos, 5 photos (CDC §6). Ce quota ne peut pas vivre dans le schéma
   * Zod — il dépend du nombre déjà attaché. `maxFeedbackMediaCount` (@cmv/shared) reste la
   * source unique de la valeur, partagée avec le client.
   */
  private async assertQuotaLeft(scheduledSessionId: string, type: MediaTypeType): Promise<void> {
    const count = await this.db.feedbackMedia.count({
      where: { type, sessionFeedback: { scheduledSessionId } },
    });
    const max = maxFeedbackMediaCount(type);
    if (count >= max) {
      throw new ConflictException(
        type === MediaType.VIDEO
          ? `Maximum ${max} vidéos par débrief`
          : `Maximum ${max} photos par débrief`,
      );
    }
  }
}

// Clé objet : segmentée par athlète puis séance, préfixe UUID contre les collisions de noms.
// Le nom de fichier est assaini (caractères sûrs uniquement), comme pour les documents.
function buildMediaKey(athleteId: string, scheduledSessionId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `athlete/${athleteId}/feedback/${scheduledSessionId}/${randomUUID()}-${safeName}`;
}

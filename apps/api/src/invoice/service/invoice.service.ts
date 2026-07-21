import { randomUUID } from "node:crypto";
import type {
  AttachInvoiceDocumentInput,
  InvoiceDto,
  PlanBillingInput,
  RequestInvoiceDocumentUploadUrlInput,
  UpdateInvoiceStatusInput,
  UploadUrlDto,
} from "@cmv/shared";
import { DEFAULT_INVOICE_CURRENCY, InvoiceStatus, PlanStatus } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Invoice, Plan, Prisma } from "@prisma/client";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { SIGNED_URL_TTL_SECONDS, StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate, toIsoDate } from "../../util/date.util";
import { toInvoiceDto } from "../invoice.mapper";

/**
 * Facturation (CDC §5.10), liée 1:1 à un cycle. Trois temps :
 * 1. Le coach saisit les termes dans le builder → facture DRAFT (`saveDraft`), invisible de
 *    l'athlète.
 * 2. Le cycle est diffusé → `issueForPlan` (appelé par PlanService dans SA transaction) passe la
 *    facture en PENDING et pose `issuedAt`.
 * 3. Le coach marque payé/impayé (`updateStatus`).
 *
 * Les lectures `list`/`get` ne servent QUE des factures émises (DRAFT exclu — il ne vit que dans le
 * builder). Le scope tenant filtre par coachId ou athleteId selon l'acteur ; `upsert` étant interdit
 * par le client tenant, `saveDraft` fait findFirst + create/update.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly storage: StorageService,
  ) {}

  // ── Builder : facture DRAFT du cycle ─────────────────────────────────────────

  // Termes de facturation du cycle courant (DRAFT), ou null tant que le coach n'a rien saisi.
  async getDraftByPlan(planId: string): Promise<InvoiceDto | null> {
    await this.getDraftablePlanOrThrow(planId);
    const draft = await this.db.invoice.findFirst({
      where: { planId, status: InvoiceStatus.DRAFT },
    });
    return draft == null ? null : this.toDto(draft);
  }

  /**
   * Crée ou met à jour la facture DRAFT du cycle. La période est DÉRIVÉE du mois de début du cycle
   * (jamais saisie) et rafraîchie à chaque enregistrement — la date de début a pu bouger depuis.
   * Refusé si le cycle est déjà diffusé (sa facture n'est plus un brouillon).
   */
  async saveDraft(planId: string, input: PlanBillingInput): Promise<InvoiceDto> {
    const plan = await this.getDraftablePlanOrThrow(planId);
    const period = periodOf(plan);

    const existing = await this.db.invoice.findFirst({
      where: { planId, status: InvoiceStatus.DRAFT },
    });

    if (existing == null) {
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      const created = await this.db.invoice.create({
        data: {
          athleteId: plan.athleteId,
          planId,
          period,
          amountCents: input.amountCents,
          currency: DEFAULT_INVOICE_CURRENCY,
          status: InvoiceStatus.DRAFT,
          dueDate: toDbDate(input.dueDate),
          note: input.note ?? null,
        } satisfies Omit<
          Prisma.InvoiceUncheckedCreateInput,
          "coachId"
        > as Prisma.InvoiceUncheckedCreateInput,
      });
      return this.toDto(created);
    }

    const updated = await this.db.invoice.update({
      where: { id: existing.id },
      data: {
        period,
        amountCents: input.amountCents,
        dueDate: toDbDate(input.dueDate),
        note: input.note ?? null,
      },
    });
    return this.toDto(updated);
  }

  /**
   * Émission au `publish` du cycle : DRAFT → PENDING, `issuedAt` posé. Appelé par PlanService DANS
   * sa transaction (le plan passe PUBLISHED et la facture est émise atomiquement). Lève si aucun
   * terme de facturation n'a été saisi — c'est le gating de la diffusion (« remplis la facturation
   * avant de diffuser »). Retourne la facture émise pour que l'appelant notifie l'athlète.
   */
  async issueForPlan(tx: TenantTx, plan: Plan): Promise<Invoice> {
    const draft = await tx.invoice.findFirst({
      where: { planId: plan.id, status: InvoiceStatus.DRAFT },
    });
    if (draft == null) {
      throw new BadRequestException("Renseigne la facturation avant de diffuser le cycle");
    }
    return tx.invoice.update({
      where: { id: draft.id },
      data: { status: InvoiceStatus.PENDING, issuedAt: new Date(), period: periodOf(plan) },
    });
  }

  // ── Suivi : factures émises (DRAFT exclu) ────────────────────────────────────

  // De la plus récemment émise à la plus ancienne — l'ordre utile aux deux rôles.
  async list(): Promise<InvoiceDto[]> {
    const invoices = await this.db.invoice.findMany({
      where: { status: { not: InvoiceStatus.DRAFT } },
      orderBy: { issuedAt: "desc" },
    });
    if (invoices.length === 0) return [];

    const [names, planTitles] = await Promise.all([
      this.resolveNames(invoices),
      this.resolvePlanTitles(invoices),
    ]);
    return Promise.all(
      invoices.map((invoice) => toInvoiceDto(invoice, names, planTitles, this.storage)),
    );
  }

  async get(id: string): Promise<InvoiceDto> {
    return this.toDto(await this.getIssuedOrThrow(id));
  }

  // ── Justificatif PDF (builder) ───────────────────────────────────────────────

  /**
   * Étape 1 : URL PUT signée pour le PDF. Mime et taille sont validés en amont par le schéma
   * (@cmv/shared). Aucune facture n'est modifiée ici — c'est le rattachement qui engage. Refusé si
   * le cycle est déjà diffusé (facturation figée).
   */
  async requestDocumentUploadUrl(
    planId: string,
    input: RequestInvoiceDocumentUploadUrlInput,
  ): Promise<UploadUrlDto> {
    const plan = await this.getDraftablePlanOrThrow(planId);
    const storagePath = buildInvoiceDocumentKey(plan.athleteId, planId, input.fileName);
    const uploadUrl = await this.storage.createUploadUrl(
      storagePath,
      input.mimeType,
      SIGNED_URL_TTL_SECONDS,
      input.size,
    );
    return { uploadUrl, storagePath, expiresIn: SIGNED_URL_TTL_SECONDS };
  }

  /**
   * Étape 2 : rattacher le PDF uploadé à la facture DRAFT du cycle. Exige des termes de facturation
   * déjà saisis (la facture DRAFT doit exister). Remplacer un PDF déjà attaché purge l'ancien objet.
   */
  async attachDocument(planId: string, input: AttachInvoiceDocumentInput): Promise<InvoiceDto> {
    await this.getDraftablePlanOrThrow(planId);
    const draft = await this.getDraftInvoiceOrThrow(planId);

    const previousPath = draft.documentPath;
    const updated = await this.db.invoice.update({
      where: { id: draft.id },
      data: {
        documentPath: input.storagePath,
        documentFileName: input.fileName,
        documentMimeType: input.mimeType,
        documentSizeBytes: input.size,
      },
    });
    // L'ancien objet n'est plus référencé : on le purge (sa clé n'appartient qu'à cette facture).
    if (previousPath != null && previousPath !== input.storagePath) {
      await this.storage.deleteObject(previousPath);
    }
    return this.toDto(updated);
  }

  // Retirer le PDF de la facture DRAFT (purge l'objet). Le cycle diffusé fige tout : refusé alors.
  async removeDocument(planId: string): Promise<InvoiceDto> {
    await this.getDraftablePlanOrThrow(planId);
    const draft = await this.getDraftInvoiceOrThrow(planId);
    if (draft.documentPath == null) {
      return this.toDto(draft);
    }
    const updated = await this.db.invoice.update({
      where: { id: draft.id },
      data: {
        documentPath: null,
        documentFileName: null,
        documentMimeType: null,
        documentSizeBytes: null,
      },
    });
    await this.storage.deleteObject(draft.documentPath);
    return this.toDto(updated);
  }

  /**
   * Marquage manuel du statut, réversible (toggle). PENDING → PAID pose `paidAt` ; le retour
   * PAID → PENDING l'efface. Idempotent : remarquer le même statut ne redate rien. DRAFT est exclu
   * (une facture non émise ne se marque pas payée).
   */
  async updateStatus(id: string, input: UpdateInvoiceStatusInput): Promise<InvoiceDto> {
    const invoice = await this.getIssuedOrThrow(id);

    if (invoice.status !== input.status) {
      const paidAt = input.status === InvoiceStatus.PAID ? new Date() : null;
      await this.db.invoice.update({ where: { id }, data: { status: input.status, paidAt } });
    }

    return this.get(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Le cycle du coach courant, refusé s'il est déjà diffusé (facturation figée à l'émission).
  private async getDraftablePlanOrThrow(planId: string): Promise<Plan> {
    const plan = await this.db.plan.findFirst({ where: { id: planId } });
    if (plan == null) {
      throw new NotFoundException("Cycle introuvable");
    }
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new BadRequestException("Cycle déjà diffusé : sa facturation est figée");
    }
    return plan;
  }

  // Une facture ÉMISE (DRAFT exclu) : le brouillon se lit via getDraftByPlan, pas par id.
  private async getIssuedOrThrow(id: string): Promise<Invoice> {
    const invoice = await this.db.invoice.findFirst({
      where: { id, status: { not: InvoiceStatus.DRAFT } },
    });
    if (invoice == null) {
      throw new NotFoundException("Facture introuvable");
    }
    return invoice;
  }

  // La facture DRAFT du cycle (termes déjà saisis). Absente → le coach doit d'abord enregistrer la
  // facturation (montant/échéance) avant d'y joindre un PDF.
  private async getDraftInvoiceOrThrow(planId: string): Promise<Invoice> {
    const draft = await this.db.invoice.findFirst({
      where: { planId, status: InvoiceStatus.DRAFT },
    });
    if (draft == null) {
      throw new BadRequestException("Enregistre d'abord la facturation avant de joindre un PDF");
    }
    return draft;
  }

  private async toDto(invoice: Invoice): Promise<InvoiceDto> {
    const [names, planTitles] = await Promise.all([
      this.resolveNames([invoice]),
      this.resolvePlanTitles([invoice]),
    ]);
    return toInvoiceDto(invoice, names, planTitles, this.storage);
  }

  private resolveNames(invoices: Invoice[]): Promise<Map<string, string>> {
    return this.users.namesByIds(invoices.flatMap((i) => [i.coachId, i.athleteId]));
  }

  // Titres des cycles facturés, en une requête scopée (jamais un include imbriqué).
  private async resolvePlanTitles(invoices: Invoice[]): Promise<Map<string, string>> {
    const planIds = invoices.map((i) => i.planId).filter((id): id is string => id != null);
    if (planIds.length === 0) return new Map();
    const plans = await this.db.plan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, title: true },
    });
    return new Map(plans.map((plan) => [plan.id, plan.title]));
  }
}

// Mois civil facturé "YYYY-MM", dérivé du début du cycle. Source unique de la dérivation.
function periodOf(plan: Plan): string {
  return toIsoDate(plan.startDate).slice(0, 7);
}

// Clé objet du justificatif : segmentée par athlète puis cycle (comme les médias de débrief). Le
// nom d'origine est assaini ; l'UUID évite toute collision.
function buildInvoiceDocumentKey(athleteId: string, planId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `athlete/${athleteId}/invoice/${planId}/${randomUUID()}-${safeName}`;
}

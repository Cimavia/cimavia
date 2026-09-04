import { randomUUID } from "node:crypto";
import type {
  AttachInvoiceDocumentInput,
  InvoiceDto,
  PlanBillingInput,
  RequestInvoiceDocumentUploadUrlInput,
  UpdateInvoiceStatusInput,
  UploadUrlDto,
} from "@cmv/shared";
import {
  DEFAULT_INVOICE_CURRENCY,
  InvoiceStatus,
  PlanStatus,
  SIGNED_URL_TTL_SECONDS,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Invoice, Plan, Prisma } from "@prisma/client";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { StorageService } from "../../infra/storage/storage.service";
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
 * 3. Le coach marque payé/impayé (`updateStatus`), ou annule (`cancel`, terminal).
 *
 * Les lectures `list`/`get` ne servent QUE des factures émises (DRAFT exclu — il ne vit que dans le
 * builder). Le scope tenant filtre par coachId ou athleteId selon l'acteur ; `upsert` étant interdit
 * par le client tenant, `saveDraft` fait findFirst + create/update.
 */
/**
 * Un cycle dont on peut facturer les termes : brouillon, et surtout ADRESSÉ à quelqu'un. Depuis
 * #144 le destinataire est facultatif pendant la construction, alors que `Invoice.athleteId` reste
 * NOT NULL — le type porte donc l'écart, plutôt que de le laisser se découvrir en base.
 */
type BillablePlan = Plan & { athleteId: string };

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
   * Le brouillon de facture SUIT le destinataire du cycle (#144). Sans lui, la séquence
   * « j'affecte à A, je saisis les termes, je réaffecte à B, je diffuse » émettrait à **A** une
   * facture pour un cycle que **B** s'entraîne : `issueForPlan` ne réécrit que le statut, jamais
   * le destinataire.
   *
   * `updateMany` plutôt qu'un `findFirst` suivi d'un `update` : sans brouillon, il n'y a rien à
   * faire et l'appel ne coûte rien — on ne fait pas une question de ce qui n'a pas de réponse.
   *
   * Appelé DANS la transaction d'affectation : un cycle dont l'athlète a changé mais pas la
   * facture est exactement ce que cette méthode existe pour empêcher.
   */
  async followPlanAthlete(tx: TenantTx, planId: string, athleteId: string): Promise<void> {
    await tx.invoice.updateMany({
      where: { planId, status: InvoiceStatus.DRAFT },
      data: { athleteId },
    });
  }

  /**
   * Détacher un cycle de son destinataire (#144) est refusé tant que ses termes de facturation
   * sont saisis : `Invoice.athleteId` est NOT NULL, et un montant qu'on n'adresse à personne n'a
   * pas de sens.
   *
   * Ce refus ne bloque le coach sur rien — il peut toujours affecter QUELQU'UN d'autre, la
   * facture suit. Seul l'état « cycle chiffré, adressé à personne » lui est fermé, et il n'a
   * jamais rien voulu dire.
   */
  async assertPlanDetachable(planId: string): Promise<void> {
    const draft = await this.db.invoice.findFirst({
      where: { planId, status: InvoiceStatus.DRAFT },
    });
    if (draft != null) {
      throw new ConflictException(
        "Ce cycle a une facturation saisie : affectez-le à un autre athlète plutôt que de le laisser sans destinataire",
      );
    }
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
    // Une annulation est définitive : la rouvrir par le toggle contournerait la garde de `cancel`.
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException("Facture annulée : son statut ne change plus");
    }

    if (invoice.status !== input.status) {
      const paidAt = input.status === InvoiceStatus.PAID ? new Date() : null;
      await this.db.invoice.update({ where: { id }, data: { status: input.status, paidAt } });
    }

    return this.get(id);
  }

  /**
   * Annulation manuelle par le coach — depuis PENDING seulement : une facture réglée ne s'annule
   * pas (elle se rembourse, hors périmètre), et une annulation ne se rejoue pas. Le cycle facturé
   * n'est PAS touché : il reste diffusé, l'athlète garde ses séances. État terminal, d'où l'absence
   * de route inverse.
   */
  async cancel(id: string): Promise<InvoiceDto> {
    const invoice = await this.getIssuedOrThrow(id);
    if (invoice.status !== InvoiceStatus.PENDING) {
      throw new ConflictException("Seule une facture en attente de règlement peut être annulée");
    }

    await this.db.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
    return this.get(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Le cycle du coach courant, refusé s'il est déjà diffusé (facturation figée à l'émission).
  private async getDraftablePlanOrThrow(planId: string): Promise<BillablePlan> {
    const plan = await this.db.plan.findFirst({ where: { id: planId } });
    if (plan == null) {
      throw new NotFoundException("Cycle introuvable");
    }
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new BadRequestException("Cycle déjà diffusé : sa facturation est figée");
    }
    /**
     * Pas encore de destinataire (#144) : `Invoice.athleteId` est NOT NULL, et on ne facture pas
     * un cycle dont on ignore à qui il s'adresse. Un refus EXPLICITE, et pas seulement un
     * formulaire fermé côté web : une contrainte gardée à la seule UI remonte en 500 au premier
     * appel direct (piège n°4 du scope automatique, `architecture-choice.md` §6).
     *
     * C'est aussi ce qui donne son ORDRE à la saisie, sans qu'on l'invente : l'athlète d'abord,
     * la facturation ensuite. La seule règle qui existe, et elle est dite.
     */
    if (plan.athleteId == null) {
      throw new ConflictException("Choisis l'athlète de ce cycle avant d'en saisir la facturation");
    }
    /**
     * Auto-coaching (#14) : on ne se facture pas soi-même. Un refus EXPLICITE plutôt qu'un
     * brouillon qu'on laisserait saisir pour rien — même principe que le refus de supprimer un
     * cycle diffusé (#85). `publish` lève d'ailleurs le gating pour ces cycles-là : sans ce
     * refus ici, le coach saisirait des termes qui ne seraient jamais émis.
     */
    if (plan.coachId === plan.athleteId) {
      throw new ConflictException("Un cycle que vous vous écrivez à vous-même ne se facture pas");
    }
    return { ...plan, athleteId: plan.athleteId };
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

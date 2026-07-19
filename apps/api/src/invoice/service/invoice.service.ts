import type { CreateInvoiceInput, InvoiceDto, UpdateInvoiceStatusInput } from "@cmv/shared";
import { CoachAthleteStatus, InvoiceStatus } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Invoice, Prisma } from "@prisma/client";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate } from "../../util/date.util";
import { toInvoiceDto } from "../invoice.mapper";

/**
 * Facturation (CDC §5.10). Une SEULE liste sert les deux rôles : le scope tenant filtre par
 * `coachId` (émetteur) ou `athleteId` (destinataire) selon l'acteur — le coach ne voit que SES
 * factures, l'athlète que les siennes. Émission et changement de statut sont réservés au coach
 * (imposé par le contrôleur). `upsert` étant interdit par le client tenant, le toggle de statut
 * passe par findFirst + update.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly notifications: NotificationService,
  ) {}

  async create(input: CreateInvoiceInput): Promise<InvoiceDto> {
    await this.assertAthleteOwned(input.athleteId);

    // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
    const invoice = await this.db.invoice.create({
      data: {
        athleteId: input.athleteId,
        period: input.period,
        amountCents: input.amountCents,
        currency: input.currency,
        dueDate: toDbDate(input.dueDate),
        note: input.note ?? null,
      } satisfies Omit<
        Prisma.InvoiceUncheckedCreateInput,
        "coachId"
      > as Prisma.InvoiceUncheckedCreateInput,
    });

    // athleteId vient d'une requête DÉJÀ scopée (assertAthleteOwned) → sûr pour le push (règle 1
    // du NotificationService). Un échec d'envoi ne fait pas échouer l'émission (règle 2).
    await this.notifications.notifyInvoiceIssued({
      athleteId: invoice.athleteId,
      invoiceId: invoice.id,
    });

    return this.toDto(invoice);
  }

  // De la plus récemment émise à la plus ancienne — l'ordre utile aux deux rôles.
  async list(): Promise<InvoiceDto[]> {
    const invoices = await this.db.invoice.findMany({ orderBy: { issuedAt: "desc" } });
    if (invoices.length === 0) return [];

    const names = await this.resolveNames(invoices);
    return invoices.map((invoice) => toInvoiceDto(invoice, names));
  }

  async get(id: string): Promise<InvoiceDto> {
    return this.toDto(await this.getOwnedOrThrow(id));
  }

  /**
   * Marquage manuel du statut, réversible (toggle). PENDING → PAID pose `paidAt` ; le retour
   * PAID → PENDING l'efface (une facture rouverte n'a plus de date de paiement). Idempotent :
   * remarquer le même statut ne redate rien.
   */
  async updateStatus(id: string, input: UpdateInvoiceStatusInput): Promise<InvoiceDto> {
    const invoice = await this.getOwnedOrThrow(id);

    if (invoice.status !== input.status) {
      const paidAt = input.status === InvoiceStatus.PAID ? new Date() : null;
      await this.db.invoice.update({ where: { id }, data: { status: input.status, paidAt } });
    }

    return this.get(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOwnedOrThrow(id: string): Promise<Invoice> {
    const invoice = await this.db.invoice.findFirst({ where: { id } });
    if (invoice == null) {
      throw new NotFoundException("Facture introuvable");
    }
    return invoice;
  }

  private async toDto(invoice: Invoice): Promise<InvoiceDto> {
    const names = await this.resolveNames([invoice]);
    return toInvoiceDto(invoice, names);
  }

  private resolveNames(invoices: Invoice[]): Promise<Map<string, string>> {
    return this.users.namesByIds(invoices.flatMap((i) => [i.coachId, i.athleteId]));
  }

  // La relation coach→athlète est scopée par le tenancy layer : un athlète qui n'est pas le sien
  // (ou une relation inactive) ne remonte pas. La FK, elle, n'impose rien — d'où ce contrôle
  // (même garde que PlanService.assertAthleteOwned).
  private async assertAthleteOwned(athleteId: string): Promise<void> {
    const relation = await this.db.coachAthlete.findFirst({
      where: { athleteId, status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException("Athlète inconnu");
    }
  }
}

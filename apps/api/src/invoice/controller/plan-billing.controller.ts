import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { AttachInvoiceDocumentDto } from "../dto/attach-invoice-document.dto";
import { PlanBillingDto } from "../dto/plan-billing.dto";
import { RequestInvoiceDocumentUploadUrlDto } from "../dto/request-invoice-document-upload-url.dto";
import { InvoiceService } from "../service/invoice.service";

/**
 * Termes de facturation d'un cycle (section « Facturation » du builder). Édite la facture DRAFT du
 * plan — COACH seul. Diffuser le cycle exige que ces termes soient saisis (gating dans
 * PlanService.publish). Route sous /plans même si servie par InvoiceService : c'est la facturation
 * DU cycle, éditée là où on le construit.
 */
@ApiTags("invoices")
@Roles([Role.COACH])
@Controller("plans/:planId/billing")
export class PlanBillingController {
  constructor(private readonly invoices: InvoiceService) {}

  // Les termes DRAFT déjà saisis, ou null (le builder affiche un formulaire vide).
  @Get()
  get(@Param("planId") planId: string) {
    return this.invoices.getDraftByPlan(planId);
  }

  @Put()
  save(@Param("planId") planId: string, @Body() dto: PlanBillingDto) {
    return this.invoices.saveDraft(planId, dto);
  }

  // ── Justificatif PDF ─────────────────────────────────────────────────────────

  // Étape 1 : URL PUT signée (le PDF part directement vers le storage, jamais via l'API).
  @Post("document/upload-url")
  requestDocumentUploadUrl(
    @Param("planId") planId: string,
    @Body() dto: RequestInvoiceDocumentUploadUrlDto,
  ) {
    return this.invoices.requestDocumentUploadUrl(planId, dto);
  }

  // Étape 2 : rattacher le PDF uploadé à la facture DRAFT.
  @Put("document")
  attachDocument(@Param("planId") planId: string, @Body() dto: AttachInvoiceDocumentDto) {
    return this.invoices.attachDocument(planId, dto);
  }

  @Delete("document")
  removeDocument(@Param("planId") planId: string) {
    return this.invoices.removeDocument(planId);
  }
}

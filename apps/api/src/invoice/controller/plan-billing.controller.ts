import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { PlanBillingDto } from "../dto/plan-billing.dto";
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
}

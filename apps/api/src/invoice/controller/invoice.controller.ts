import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { UpdateInvoiceStatusDto } from "../dto/update-invoice-status.dto";
import { InvoiceService } from "../service/invoice.service";

/**
 * Suivi des factures ÉMISES (CDC §5.10). L'émission n'est PAS une action HTTP isolée : elle se fait
 * à la diffusion du cycle (PlanController). Lecture : les deux rôles (le service scope
 * automatiquement — coach voit SES factures émises, athlète les siennes ; DRAFT exclu). Marquage du
 * statut : COACH seul. @Roles au niveau MÉTHODE (les droits diffèrent selon la route).
 */
@ApiTags("invoices")
@Controller("invoices")
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @Roles([Role.COACH, Role.ATHLETE])
  list() {
    return this.invoices.list();
  }

  @Get(":id")
  @Roles([Role.COACH, Role.ATHLETE])
  get(@Param("id") id: string) {
    return this.invoices.get(id);
  }

  // Toggle payé/impayé (le retour arrière PAID → PENDING est confirmé côté UI).
  @Patch(":id/status")
  @Roles([Role.COACH])
  updateStatus(@Param("id") id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.invoices.updateStatus(id, dto);
  }
}

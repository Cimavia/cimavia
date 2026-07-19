import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateInvoiceDto } from "../dto/create-invoice.dto";
import { UpdateInvoiceStatusDto } from "../dto/update-invoice-status.dto";
import { InvoiceService } from "../service/invoice.service";

/**
 * Facturation (CDC §5.10). Émission et changement de statut : COACH seul. Lecture : les deux rôles
 * (le service scope automatiquement — le coach voit SES factures émises, l'athlète les siennes).
 * @Roles au niveau MÉTHODE (pas de classe), comme InvitationController : les droits diffèrent selon
 * la route.
 */
@ApiTags("invoices")
@Controller("invoices")
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Post()
  @Roles([Role.COACH])
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

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

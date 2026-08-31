import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { UpdateInvoiceStatusDto } from "../dto/update-invoice-status.dto";
import { InvoiceService } from "../service/invoice.service";

/**
 * Suivi des factures ÉMISES (CDC §5.10). L'émission n'est PAS une action HTTP isolée : elle se fait
 * à la diffusion du cycle (PlanController). Lecture : les deux capacités (le scope tenant tranche —
 * coach voit SES factures émises, athlète les siennes ; DRAFT exclu). Marquage du statut : coach
 * seul. Capacité au niveau MÉTHODE (les droits diffèrent selon la route).
 *
 * `"either"` sur la lecture, et c'est là que vit la question du double compte : un utilisateur qui
 * cumule doit dire `?as=coach` ou `?as=athlete`, sinon 400. Un compte mono-capacité n'a rien à
 * préciser, sa capacité étant la seule réponse possible — d'où l'absence de rupture pour les
 * clients existants (#10).
 */
@ApiTags("invoices")
@Controller("invoices")
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @RequireCapability("either")
  list() {
    return this.invoices.list();
  }

  @Get(":id")
  @RequireCapability("either")
  get(@Param("id") id: string) {
    return this.invoices.get(id);
  }

  // Toggle payé/impayé (le retour arrière PAID → PENDING est confirmé côté UI).
  @Patch(":id/status")
  @RequireCapability("coach")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.invoices.updateStatus(id, dto);
  }

  /**
   * Annulation — action gardée (PENDING seulement, 409 sinon) et irréversible, d'où sa route
   * propre plutôt qu'une valeur de plus dans le toggle. Même geste que `POST /plans/:id/publish`.
   */
  @Post(":id/cancel")
  @HttpCode(200)
  @RequireCapability("coach")
  cancel(@Param("id") id: string) {
    return this.invoices.cancel(id);
  }
}

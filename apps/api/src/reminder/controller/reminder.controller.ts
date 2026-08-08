import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateReminderDto } from "../dto/create-reminder.dto";
import { UpdateReminderStatusDto } from "../dto/update-reminder-status.dto";
import { ReminderService } from "../service/reminder.service";

/**
 * Rappels du coach (#44). `@Roles([Role.COACH])` au niveau CLASSE, et ce n'est pas décoratif : un
 * rappel est un outil privé du coach, `Reminder` n'a donc aucun scope athlète dans `TENANT_SCOPES`.
 * Sans cette garde, une requête d'athlète atteindrait l'extension Prisma, qui refuse par une
 * ERREUR — un 500 là où le client attend un 403.
 *
 * Pas de `DELETE` : `DISMISSED` est la suppression douce (cf. `ReminderStatus`). Pas de route
 * d'édition non plus en première passe — reporter une échéance passe par un nouveau rappel.
 */
@ApiTags("reminders")
@Controller("reminders")
@Roles([Role.COACH])
export class ReminderController {
  constructor(private readonly reminders: ReminderService) {}

  // À traiter d'abord (le plus en retard en tête), puis les traités : le client segmente sans
  // retrier (cf. `ReminderService.list`).
  @Get()
  list() {
    return this.reminders.list();
  }

  @Post()
  create(@Body() dto: CreateReminderDto) {
    return this.reminders.create(dto);
  }

  // Toggle fait / abandonné / rouvert. Une seule route pour les trois : la transition est
  // réversible et non gardée, contrairement à l'annulation d'une facture.
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateReminderStatusDto) {
    return this.reminders.updateStatus(id, dto);
  }
}

import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateReminderDto } from "../dto/create-reminder.dto";
import { UpdateReminderDto } from "../dto/update-reminder.dto";
import { UpdateReminderStatusDto } from "../dto/update-reminder-status.dto";
import { ReminderService } from "../service/reminder.service";

/**
 * Rappels du coach (#44). `@Roles([Role.COACH])` au niveau CLASSE, et ce n'est pas décoratif : un
 * rappel est un outil privé du coach, `Reminder` n'a donc aucun scope athlète dans `TENANT_SCOPES`.
 * Sans cette garde, une requête d'athlète atteindrait l'extension Prisma, qui refuse par une
 * ERREUR — un 500 là où le client attend un 403.
 *
 * Pas de `DELETE` : `DISMISSED` est la suppression douce (cf. `ReminderStatus`). L'édition, elle,
 * est arrivée en #105 — l'absence de report d'échéance (dette R-3) obligeait à traiter un rappel
 * puis à en créer un autre.
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

  /**
   * Les compteurs, servis À PART de la liste — même raison que `unread-count` côté notifications :
   * une tuile de tableau de bord veut un chiffre, pas les 200 lignes de `GET /reminders`.
   *
   * `summary` est un segment LITTÉRAL : il doit rester déclaré avant toute route paramétrée. Nest
   * résout dans l'ordre de déclaration — un futur `@Get(":id")` placé au-dessus l'avalerait et
   * chercherait un rappel d'id « summary ».
   */
  @Get("summary")
  summary() {
    // `now` vient du contrôleur, pas du service : le service reste testable sans horloge, et c'est
    // la même convention que `NotificationFeedService` pour les rappels dus.
    return this.reminders.summary(new Date());
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

  /**
   * Report d'échéance et correction de note (#105). Déclarée APRÈS `@Patch(":id/status")` : les
   * deux chemins n'ont pas le même nombre de segments, donc ne se disputent rien aujourd'hui — mais
   * l'ordre de déclaration reste la seule chose qui départage deux routes chez Nest, et l'inverser
   * un jour ferait avaler `/status` par le paramètre.
   *
   * Le statut n'est pas modifiable ici : le schéma le refuse (`.strict()`), pour qu'il n'existe
   * qu'un seul chemin vers une transition.
   */
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(id, dto);
  }
}

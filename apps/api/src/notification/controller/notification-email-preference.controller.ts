import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UpdateNotificationEmailPreferencesDto } from "../dto/update-notification-email-preferences.dto";
import { NotificationEmailPreferenceService } from "../service/notification-email-preference.service";

/**
 * Réglage des notifications par e-mail de l'utilisateur courant (#65).
 *
 * Aucune capacité déclarée, pour la même raison que `/me/push-tokens` et que le centre : les DEUX
 * rôles reçoivent des notifications, et un compte à double capacité n'a qu'un seul réglage — lui
 * faire choisir un titre reviendrait à lui donner deux boîtes mail.
 *
 * `PUT` et non `PATCH` : la ressource est l'ENSEMBLE des types activés, et c'est lui qu'on
 * remplace. Une bascule par type demanderait une route par type et rouvrirait les écritures
 * concurrentes que le remplacement ferme.
 */
@ApiTags("notifications")
@Controller("me/notification-preferences")
export class NotificationEmailPreferenceController {
  constructor(private readonly preferences: NotificationEmailPreferenceService) {}

  @Get()
  list() {
    return this.preferences.list();
  }

  @Put()
  replace(@Body() dto: UpdateNotificationEmailPreferencesDto) {
    return this.preferences.replace(dto);
  }
}

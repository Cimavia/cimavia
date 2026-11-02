import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ExercisesNoCapability } from "../../auth/decorator/require-capability.decorator";
import { NotificationFilterDto } from "../dto/notification-filter.dto";
import { NotificationFeedService } from "../service/notification-feed.service";

/**
 * Centre de notifications de l'utilisateur courant (#48). AUCUNE capacité exercée, comme pour les
 * tokens push, et c'est un choix : ce centre montre ce qui m'est ADRESSÉ, sans notion de titre.
 * Lui en faire déclarer un obligerait un compte à double capacité à choisir à quel titre il
 * consulte ses notifications — et à n'en voir que la moitié. `Notification` scope sur `recipientId`
 * quelle que soit la capacité, ce qui suffit.
 *
 * Le centre lit pourtant AUSSI les rappels (#51), et `Reminder` est le seul modèle métier sans
 * scope athlète : sans capacité exercée, l'extension tenant refuse la table (« Appris en #44/#51 »).
 * C'est `NotificationFeedService` qui le résout, au plus près de la lecture concernée
 * (`runAsCapability`), plutôt qu'en donnant un titre à la route entière.
 */
@ApiTags("notifications")
@ExercisesNoCapability()
@Controller("me/notifications")
export class NotificationController {
  constructor(private readonly feed: NotificationFeedService) {}

  // `?category=` (#694) : une catégorie inconnue est un 400, pas une liste vide. Le même DTO que
  // `read-all`, validé par le même pipe global : un seul chemin pour un seul filtre.
  @Get()
  list(@Query() filter: NotificationFilterDto) {
    return this.feed.list(filter);
  }

  // Route séparée de la liste : c'est le badge, rafraîchi en continu — il ne doit pas ramener
  // 50 lignes pour afficher un chiffre.
  @Get("unread-count")
  unreadCount() {
    return this.feed.unreadCount();
  }

  // Marquage au clic : le client ouvre l'entité visée dans la foulée.
  @Patch(":id/read")
  markRead(@Param("id") id: string) {
    return this.feed.markRead(id);
  }

  // Geste global, distinct du marquage unitaire : rien à renvoyer, le client réinvalide. Le même
  // filtre que la liste, dans le corps : sans catégorie, tout le centre.
  @Post("read-all")
  @HttpCode(204)
  markAllRead(@Body() dto: NotificationFilterDto) {
    return this.feed.markAllRead(dto);
  }
}

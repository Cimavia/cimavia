import { Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { NotificationFeedService } from "../service/notification-feed.service";

/**
 * Centre de notifications de l'utilisateur courant (#48). AUCUNE capacité déclarée, comme pour les
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
@Controller("me/notifications")
export class NotificationController {
  constructor(private readonly feed: NotificationFeedService) {}

  @Get()
  list() {
    return this.feed.list();
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

  // Geste global, distinct du marquage unitaire : rien à renvoyer, le client réinvalide.
  @Post("read-all")
  @HttpCode(204)
  markAllRead() {
    return this.feed.markAllRead();
  }
}

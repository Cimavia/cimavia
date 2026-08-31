import { Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { NotificationFeedService } from "../service/notification-feed.service";

/**
 * Centre de notifications de l'utilisateur courant (#48). Les DEUX capacités en reçoivent
 * (l'athlète un cycle diffusé, le coach un débrief), d'où `"either"` : `Notification` scope sur
 * `recipientId` quelle que soit la capacité, chacun ne lisant que ce qui lui est adressé.
 *
 * La déclaration n'est pourtant pas décorative, et c'est `PushTokenController` qui montre la
 * différence — lui n'en a aucune. Ce centre lit AUSSI les rappels (#51), et `Reminder` est le seul
 * modèle métier sans scope athlète : sans capacité exercée, l'extension tenant refuse la table et
 * l'écran entier tombe en 500. C'est la panne décrite dans « Appris en #44/#51 », que #10 a
 * ressortie telle quelle en retirant la dérivation depuis le rôle de l'acteur.
 */
@ApiTags("notifications")
@RequireCapability("either")
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

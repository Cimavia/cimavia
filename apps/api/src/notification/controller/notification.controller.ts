import { Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { NotificationFeedService } from "../service/notification-feed.service";

/**
 * Centre de notifications de l'utilisateur courant (#48). Aucun `@Roles` — comme pour les tokens
 * push, les DEUX rôles reçoivent des notifications (l'athlète un cycle diffusé, le coach un
 * débrief) ; le scope tenant suffit, chacun ne lisant que ce qui lui est adressé.
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

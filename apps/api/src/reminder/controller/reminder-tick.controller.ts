import type { ReminderTickResultDto } from "@cmv/shared";
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import { NoRateLimit } from "../../rate-limit/rate-limit.policy";
import { ReminderTickGuard } from "../guard/reminder-tick.guard";
import { ReminderTickService } from "../service/reminder-tick.service";

/**
 * Déclencheur des rappels automatiques (#47), appelé par un cron EXTERNE.
 *
 * Contrôleur séparé de `ReminderController`, et pas par goût du rangement : celui-ci porte
 * `@RequireCapability("coach")` au niveau classe, ce qui suppose une session. Ici il n'y a **aucun
 * acteur** — c'est une machine qui appelle — d'où `@AllowAnonymous` (Better Auth) plus une garde à
 * secret partagé. Les mêler aurait donné à un rôle des droits sur une route qui n'en relève pas.
 *
 * Le chemin est préfixé `internal/` pour que sa nature se lise dans les logs et dans le tunnel
 * Cloudflare : ce n'est pas une surface produit, aucun client ne l'appelle.
 *
 * **Pourquoi une route plutôt qu'un cron in-process** (`@nestjs/schedule`) : sur la cible MVP
 * Scaleway Serverless Containers, en scale-to-zero, aucun process ne tourne pour tirer le tick — il
 * serait silencieusement mort en production tout en marchant sur le NAS. Décision d'hébergement
 * tranchée le 2026-08-12, avec deux bénéfices : c'est gratuit, et une route s'exerce en e2e là où
 * un tick interne ne se déclenche pas sous test.
 */
@ApiTags("reminders")
@Controller("internal/reminders")
@AllowAnonymous()
// Sans acteur, il serait compté sur l'IP du cron — celle d'un runner GitHub, partagée avec d'autres
// et qui change d'un passage à l'autre (#781) ; le secret de la garde suffit à le fermer (#782).
@NoRateLimit()
@UseGuards(ReminderTickGuard)
export class ReminderTickController {
  constructor(
    private readonly tick: ReminderTickService,
    private readonly purge: ObjectPurgeService,
  ) {}

  /**
   * 200 et non 201 : un tick ne crée pas une ressource à une adresse, il rapporte ce qu'il a fait.
   * Le corps est ce qui rend le job vérifiable — un 200 muet ne distingue pas « rien à faire » de
   * « n'a rien fait ».
   *
   * `now` vient du contrôleur, pas du service : celui-ci reste testable sans horloge, même
   * convention que `ReminderService.summary` et `NotificationFeedService`.
   *
   * La file des objets à retirer se vide au même passage (#256) : c'est le seul déclencheur qu'a
   * l'API, et un second cron n'apporterait qu'une chose de plus à configurer sur chaque hébergeur.
   * Avant les rappels, et sans pouvoir échouer : un rappel qui lève à chaque passage ne doit pas
   * bloquer indéfiniment le retrait des fichiers d'un compte supprimé.
   */
  @Post("tick")
  @HttpCode(HttpStatus.OK)
  async run(): Promise<ReminderTickResultDto> {
    const purgedObjects = await this.purge.drainSafely();
    return { ...(await this.tick.run(new Date())), purgedObjects };
  }
}

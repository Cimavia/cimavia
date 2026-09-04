import type {
  NotificationEmailPreferenceDto,
  UpdateNotificationEmailPreferencesInput,
} from "@cmv/shared";
import { EMAILABLE_NOTIFICATION_TYPES } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

/**
 * Réglage des notifications par e-mail de l'utilisateur courant (#65).
 *
 * Scopé `userId` pour les deux rôles (TENANT_SCOPES), comme `PushTokenService` : chacun ne règle
 * que ses propres notifications. La lecture pour ENVOYER vise un autre tenant (le destinataire) et
 * ne passe donc pas par ici — voir `NotificationService`.
 */
@Injectable()
export class NotificationEmailPreferenceService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  /**
   * La GRILLE complète : un `enabled` pour chacun des types envoyables, dans l'ordre du produit.
   *
   * On ne rend pas la seule liste des types actifs. L'écran de réglages n'a ainsi rien à déduire
   * d'une absence, et le jour où un type s'ajoute il apparaît sans redéploiement du client.
   */
  async list(): Promise<NotificationEmailPreferenceDto[]> {
    const enabled = await this.enabledTypes();
    return EMAILABLE_NOTIFICATION_TYPES.map((type) => ({ type, enabled: enabled.has(type) }));
  }

  /**
   * Remplace l'ENSEMBLE des types activés.
   *
   * Un remplacement plutôt qu'une bascule par type : l'écriture devient idempotente et sans état
   * intermédiaire, et deux bascules parties en même temps depuis un écran ne peuvent pas s'écraser
   * à moitié. Les types absents de la liste sont supprimés — ce qui est aussi le défaut, puisque
   * l'absence de ligne vaut « désactivé ».
   *
   * Les deux écritures tiennent dans une transaction : entre le `deleteMany` et le `createMany`,
   * l'utilisateur n'a un instant AUCUNE préférence, et une notification émise pile là ne partirait
   * pas par e-mail alors que rien n'a été coupé.
   */
  async replace(
    input: UpdateNotificationEmailPreferencesInput,
  ): Promise<NotificationEmailPreferenceDto[]> {
    // Le client peut envoyer deux fois le même type sans que ce soit une faute de saisie ; c'est
    // l'unicité `[userId, type]` qui le refuserait, en 500. On dédoublonne avant d'écrire.
    const wanted = [...new Set(input.enabled)];

    // `userId` est injecté par la couche tenant (`scopeData`), jamais fourni par l'appelant —
    // d'où le type amputé de ce champ, puis le cast au moment de l'appel. Même geste que
    // `PushTokenService`, pour la même raison.
    const data: Omit<Prisma.NotificationEmailPreferenceCreateManyInput, "userId">[] = wanted.map(
      (type) => ({ type }),
    );

    await this.db.$transaction(async (tx: TenantTx) => {
      // `notIn: []` supprime TOUT — vérifié contre Postgres, ce n'est pas une déduction : Prisma
      // rend la condition toujours vraie quand la liste est vide. C'est exactement le geste
      // « je coupe tout », et c'est pourquoi il n'y a pas de cas particulier ici. Ne pas en
      // ajouter un : il serait mort, donc jamais éprouvé.
      await tx.notificationEmailPreference.deleteMany({ where: { type: { notIn: wanted } } });
      // `skipDuplicates` : réenregistrer un type déjà actif est le cas NORMAL — l'écran renvoie
      // l'ensemble à chaque bascule —, pas une collision à signaler.
      await tx.notificationEmailPreference.createMany({
        data: data as Prisma.NotificationEmailPreferenceCreateManyInput[],
        skipDuplicates: true,
      });
    });

    return this.list();
  }

  /**
   * Les types activés, tels qu'ils sont en base — SANS filtrage.
   *
   * La colonne porte l'enum complet, donc une ligne d'un type non envoyable peut exister (un
   * élargissement puis un retour en arrière). Elle est inoffensive : `list()` n'interroge cet
   * ensemble que sur les types envoyables, donc une ligne étrangère n'allume rien. Un filtre ici
   * serait une défense sans effet — et le premier jet en portait un, que le typecheck a démasqué
   * en refusant le test censé l'éprouver.
   */
  private async enabledTypes(): Promise<Set<string>> {
    const rows = await this.db.notificationEmailPreference.findMany({ select: { type: true } });
    return new Set(rows.map((row) => row.type));
  }
}

import { required } from "@cmv/shared";
import type { Message, Prisma } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";

/**
 * La date d'un nouveau message de ce fil : maintenant, mais jamais avant le dernier message du fil
 * (#867). L'horloge du serveur peut reculer — WSL2 se recale par à-coups de plusieurs secondes
 * (#833), un serveur que NTP ramène en arrière aussi. Daté par elle seule, le message passerait
 * avant celui qui l'a précédé : le fil et l'aperçu de la liste à rebours, et un non-lu perdu,
 * daté avant la marque de lecture de son destinataire.
 *
 * Une milliseconde de plus que le dernier, pas la même date : le fil se trie sur `createdAt`, sans
 * second critère, et deux messages à égalité y prendraient un ordre arbitraire.
 *
 * `lastMessageAt` : la date du dernier message du fil, `null` pour un fil encore vide.
 */
export function nextMessageDate(lastMessageAt: Date | null, now: Date = new Date()): Date {
  if (lastMessageAt == null || now > lastMessageAt) return now;
  return new Date(lastMessageAt.getTime() + 1);
}

/**
 * Écrit un message dans son fil, daté par `nextMessageDate`, et remonte le fil dans la liste
 * (`lastMessageAt` sert à son tri, sans agréger les messages). Seule porte d'écriture d'un message :
 * l'envoi et l'avis de débrief y passent tous deux.
 *
 * `lastMessageAt` est relu DANS la transaction : celui du fil chargé en début de requête ignorerait
 * un message validé depuis — le temps d'une relecture au storage, d'un rattachement à résoudre.
 * Et il n'est jamais ramené en arrière : un envoi concurrent validé après celui-ci peut porter une
 * date plus ancienne, et le message suivant se daterait alors sur elle.
 */
export async function appendMessage(
  tx: TenantTx,
  data: Prisma.MessageUncheckedCreateInput,
): Promise<Message> {
  const { conversationId } = data;
  const conversation = required(
    await tx.conversation.findFirst({
      where: { id: conversationId },
      select: { lastMessageAt: true },
    }),
    `[message] conversation ${conversationId} introuvable à l'écriture`,
  );
  const created = await tx.message.create({
    data: { ...data, createdAt: nextMessageDate(conversation.lastMessageAt) },
  });
  await tx.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: created.createdAt } }],
    },
    data: { lastMessageAt: created.createdAt },
  });
  return created;
}

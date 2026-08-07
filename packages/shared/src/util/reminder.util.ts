import { ReminderStatus } from "../dto/reminder.schema";

// Ce dont dépend l'échéance d'un rappel, et rien de plus (même forme structurelle qu'`InvoiceTiming`
// pour `resolveInvoiceState`) : la fonction accepte donc aussi bien un `ReminderDto` qu'une ligne.
export type ReminderTiming = { dueAt: string; status: ReminderStatus };

/**
 * Un rappel est-il **dû** ? C'est la seule dérivation temporelle de la feature, et elle vit ici
 * plutôt que dans l'API : le centre de notifications l'applique à la lecture (#51) et les clients
 * s'en servent pour distinguer « en retard » de « à venir » dans la liste. Deux implémentations
 * auraient divergé sur la borne (`<` ou `<=`).
 *
 * Calculé à la LECTURE, jamais persisté ni poussé : aucun job en arrière-plan n'existe tant que
 * #47 n'a pas atterri. Conséquence assumée — un rappel qui devient dû n'émet aucun push, il
 * apparaît au prochain chargement.
 *
 * Un rappel DONE ou DISMISSED n'est jamais dû, quelle que soit son échéance : le temps ne rouvre
 * pas ce qui a été traité (même règle que `resolveInvoiceState` sur une facture payée).
 *
 * Contrairement au reste du fichier de formatage, `dueAt` est comparé comme un **instant** (et non
 * comme une date civile) : un rappel se déclenche à une heure. Une valeur illisible rend `false` —
 * une donnée corrompue ne doit pas fabriquer une alerte. Le schéma Zod (`z.iso.datetime()`) est ce
 * qui garantit en amont qu'on n'y arrive pas.
 */
export function isReminderDue(reminder: ReminderTiming, now: Date): boolean {
  if (reminder.status !== ReminderStatus.PENDING) return false;
  const dueAt = Date.parse(reminder.dueAt);
  if (Number.isNaN(dueAt)) return false;
  return dueAt <= now.getTime();
}

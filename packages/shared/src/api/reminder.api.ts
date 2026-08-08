import type {
  CreateReminderInput,
  ReminderDto,
  UpdateReminderStatusInput,
} from "../dto/reminder.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP des rappels du coach (#44), partagés web ↔ mobile.
 *
 * Deuxième module de ce genre après `createNotificationApi` (#48), et pour la même raison : la
 * plomberie HTTP n'a rien de spécifique à un client — mêmes routes, mêmes DTO, mêmes clés de cache.
 * Seule l'UI diffère. L'écrire deux fois, c'est garantir qu'un chemin change d'un côté sans l'autre.
 *
 * Ici la promotion est faite AVANT le second client : l'écran mobile (#46) attend la nav par rôle
 * (#35), mais rien ne justifiait de l'attendre pour partager ce qui l'est déjà par nature. Le jour
 * où il arrive, il n'a plus qu'un écran à écrire.
 *
 * Le client est INJECTÉ plutôt qu'importé : chaque app construit le sien (cookie de navigateur côté
 * web, SecureStore côté mobile). Ce module ne connaît que le contrat `ApiClient`.
 */
export const reminderKeys = {
  all: ["reminders"] as const,
  list: () => ["reminders", "list"] as const,
};

export type ReminderApi = {
  /**
   * Les rappels à traiter d'abord (le plus en retard en tête), puis les traités (les plus récemment
   * touchés en tête). L'ordre est imposé par l'API : le client segmente, il ne retrie pas.
   */
  list: () => Promise<ReminderDto[]>;
  /** 400 si la cible n'appartient pas au coach — elle n'est pas contrainte par une clé étrangère. */
  create: (input: CreateReminderInput) => Promise<ReminderDto>;
  /** Fait / abandonné / rouvert : un toggle, réversible dans les deux sens. Idempotent. */
  updateStatus: (id: string, input: UpdateReminderStatusInput) => Promise<ReminderDto>;
};

export function createReminderApi(api: ApiClient): ReminderApi {
  return {
    list: () => api.get<ReminderDto[]>("/reminders"),
    create: (input) => api.post<ReminderDto>("/reminders", input),
    updateStatus: (id, input) => api.patch<ReminderDto>(`/reminders/${id}/status`, input),
  };
}

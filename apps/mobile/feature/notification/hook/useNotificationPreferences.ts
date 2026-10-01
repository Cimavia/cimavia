import { type NotificationEmailPreferenceDto, preferenceToggleMutation } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationPreferenceApi, notificationPreferenceKeys } from "@/feature/notification/api";

/**
 * La grille des réglages d'e-mail : un état par type envoyable (#65).
 *
 * Clé de cache distincte de celle des notifications : régler un canal ne change rien à ce qui a
 * déjà été reçu, et les fondre ferait réinvalider la liste et le badge à chaque bascule.
 */
export function useNotificationPreferences() {
  return useQuery<NotificationEmailPreferenceDto[]>({
    queryKey: notificationPreferenceKeys.all,
    queryFn: () => notificationPreferenceApi.list(),
  });
}

/**
 * Bascule un type et l'enregistre aussitôt — pas de bouton « Enregistrer ». L'optimisme et son
 * retour arrière sont communs aux deux clients : voir `preferenceToggleMutation`. Sur mobile,
 * l'interrupteur revient sans message : l'app n'a pas de toast (#137).
 */
export function useToggleNotificationPreference() {
  return useMutation(preferenceToggleMutation(useQueryClient(), notificationPreferenceApi));
}

import * as Notifications from "expo-notifications";

/**
 * Comportement d'une notification reçue APP OUVERTE. Sans ce handler, Android/iOS ne l'affichent
 * pas au premier plan : le coach qui a l'app ouverte ne verrait jamais passer un débrief.
 *
 * Importé une seule fois, depuis `app/_layout.tsx` — c'est une configuration globale, pas un
 * effet de composant.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePushToken, useUnreadNotificationCount } from "@/feature/notification";
import { tabBarTheme } from "@/shared/theme/navigation";

// Onglets de l'athlète (routing only — cf. règle « pure shells »).
const TABS = [
  { name: "planning", labelKey: "nav.planning", icon: "calendar-outline" },
  { name: "sessions", labelKey: "nav.sessions", icon: "barbell-outline" },
  { name: "messages", labelKey: "nav.messages", icon: "chatbubble-outline" },
  { name: "invoices", labelKey: "nav.invoices", icon: "receipt-outline" },
  { name: "notifications", labelKey: "nav.notifications", icon: "notifications-outline" },
  { name: "profile", labelKey: "nav.profile", icon: "person-outline" },
] as const;

// Un seul onglet porte un compteur ; le nommer ici évite un drapeau sur chaque entrée de TABS.
const BADGED_TAB = "notifications";
// Au-delà, le chiffre exact n'apporte rien et déborde de la pastille.
const BADGE_MAX = 99;

/**
 * La pastille de l'onglet, ou `{}` s'il n'y a rien à signaler. On rend un OBJET à étaler plutôt
 * qu'une valeur : sous `exactOptionalPropertyTypes`, poser `tabBarBadge: undefined` n'est pas la
 * même chose que ne pas poser la propriété — et une pastille « 0 » se dessinerait quand même.
 */
function badgeOptionFor(unreadCount: number | undefined): { tabBarBadge?: string | number } {
  if (unreadCount == null || unreadCount === 0) return {};
  return { tabBarBadge: unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount };
}

export default function AppTabsLayout() {
  const { t } = useTranslation();
  // Enregistre l'appareil pour les push, une fois l'utilisateur connecté (zone authentifiée).
  usePushToken();
  const { data: unreadCount } = useUnreadNotificationCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Masque la barre d'onglets à l'ouverture du clavier : dans la messagerie, elle resterait
        // sinon posée par-dessus le clavier, entre lui et le champ de saisie.
        tabBarHideOnKeyboard: true,
        // La barre d'onglets est peinte en NATIF : elle ignore les className, d'où ces valeurs
        // (tirées de @cmv/tokens — aucun hex ici, règle dure n°3).
        tabBarActiveTintColor: tabBarTheme.activeTintColor,
        tabBarInactiveTintColor: tabBarTheme.inactiveTintColor,
        tabBarStyle: {
          backgroundColor: tabBarTheme.backgroundColor,
          borderTopColor: tabBarTheme.borderColor,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.labelKey),
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color} size={size} />,
            ...(tab.name === BADGED_TAB ? badgeOptionFor(unreadCount) : {}),
          }}
        />
      ))}
    </Tabs>
  );
}

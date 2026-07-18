import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePushToken } from "@/feature/notification";
import { tabBarTheme } from "@/shared/theme/navigation";

// Onglets de l'athlète (routing only — cf. règle « pure shells »).
// Factures (P6) s'ajouteront ici.
const TABS = [
  { name: "planning", labelKey: "nav.planning", icon: "calendar-outline" },
  { name: "sessions", labelKey: "nav.sessions", icon: "barbell-outline" },
  { name: "messages", labelKey: "nav.messages", icon: "chatbubble-outline" },
  { name: "profile", labelKey: "nav.profile", icon: "person-outline" },
] as const;

export default function AppTabsLayout() {
  const { t } = useTranslation();
  // Enregistre l'appareil pour les push, une fois l'utilisateur connecté (zone authentifiée).
  usePushToken();

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
          }}
        />
      ))}
    </Tabs>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { tabBarTheme } from "@/shared/theme/navigation";

// Onglets de l'athlète (routing only — cf. règle « pure shells »).
// Messagerie (P5) et Factures (P6) s'ajouteront ici.
const TABS = [
  { name: "planning", labelKey: "nav.planning", icon: "calendar-outline" },
  { name: "sessions", labelKey: "nav.sessions", icon: "barbell-outline" },
  { name: "profile", labelKey: "nav.profile", icon: "person-outline" },
] as const;

export default function AppTabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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

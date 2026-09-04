import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCounterparts } from "@/feature/account/hook/useCounterparts";
import { usePushToken, useUnreadNotificationCount } from "@/feature/notification";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { redirectForPath, TABS, visibleTabs } from "@/shared/lib/tabs";
import { tabBarTheme } from "@/shared/theme/navigation";

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

/**
 * Onglets filtrés par capacité (routing only — cf. règle « pure shells »).
 *
 * ⚠️ Expo Router enregistre **tout** fichier de ce dossier comme onglet : masquer ceux de l'autre
 * capacité passe par `href: null`, jamais par l'omission d'un `<Tabs.Screen>`. Ce n'est pas
 * cosmétique — `/planning`, `/sessions` et `/messages` appellent des routes `@Roles([ATHLETE])`,
 * et un coach qui les atteignait prenait un 403 sur son propre écran.
 */
export default function AppTabsLayout() {
  const { t } = useTranslation();
  // Enregistre l'appareil pour les push, une fois l'utilisateur connecté (zone authentifiée).
  usePushToken();
  const { data: unreadCount } = useUnreadNotificationCount();
  const capabilities = useCapabilities();
  const counterparts = useCounterparts();
  const pathname = usePathname();

  /**
   * `href: null` masque l'onglet mais ne choisit pas la route INITIALE du navigateur : sans cette
   * garde, un coach atterrit sur `/planning` (premier écran déclaré) avec une barre d'onglets
   * pourtant correcte. Tant que la session n'est pas résolue, on ne redirige pas — sinon toute
   * capacité paraîtrait absente le temps d'un aller-retour.
   */
  const redirect = capabilities.isPending
    ? null
    : redirectForPath(pathname, capabilities, counterparts);
  if (redirect != null) return <Redirect href={redirect} />;

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
      {TABS.map((tab) => {
        // `visibleTabs` n'est pas utilisable ici : Expo Router exige un `<Tabs.Screen>` pour CHAQUE
        // fichier du dossier — c'est `href: null` qui masque, jamais l'omission. On parcourt donc
        // la table entière et on décide onglet par onglet.
        const shown = visibleTabs(capabilities, counterparts).includes(tab);

        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.labelKey),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={tab.icon} color={color} size={size} />
              ),
              // `href: null` retire l'onglet de la barre ET rend sa route inatteignable. Pour la
              // messagerie sans interlocuteur (#198), c'est plus strict que le web, qui la laisse
              // joignable par son URL — ici il n'y a pas d'URL à taper, et rien à y voir.
              ...(shown ? {} : { href: null }),
              ...(tab.name === BADGED_TAB ? badgeOptionFor(unreadCount) : {}),
            }}
          />
        );
      })}
    </Tabs>
  );
}

import { type CapabilityName, capabilitiesOf, Role } from "@cmv/shared";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { authClient } from "@/shared/lib/auth";

/**
 * Le titre auquel les écrans partagés (Factures, Messagerie) lisent — `null` quand la question ne
 * se pose pas, c'est-à-dire pour tout compte mono-capacité.
 *
 * Sur le web, ce titre vit dans l'URL : deux entrées de navigation, deux adresses. Une barre
 * d'onglets ne peut pas doubler ses entrées sans en compter dix, d'où un choix différent ici
 * (#129) — un sélecteur en tête des deux écrans concernés, et cet état pour le porter.
 *
 * Un contexte plutôt qu'un état d'écran : le hook de données (`useInvoices`, `useConversations`)
 * a besoin du titre pour construire sa requête ET sa clé de cache, et il est appelé bien plus bas
 * que le sélecteur. Le faire descendre en props traverserait des composants que ça ne regarde pas.
 */
const ExercisedCapabilityContext = createContext<{
  override: CapabilityName | null;
  setOverride: (capability: CapabilityName) => void;
} | null>(null);

export function ExercisedCapabilityProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [override, setOverride] = useState<CapabilityName | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return (
    <ExercisedCapabilityContext.Provider value={value}>
      {children}
    </ExercisedCapabilityContext.Provider>
  );
}

/**
 * `null` pour un compte mono-capacité : l'API n'a qu'une réponse possible pour lui, l'URL reste
 * nue, et rien ne change par rapport à avant #12.
 *
 * Pour un compte qui cumule : le choix du sélecteur s'il a été fait, sinon le **persona** (`role`)
 * — l'univers d'atterrissage que #9 lui a laissé. Ce n'est pas un droit dérivé du rôle : la garde,
 * elle, lit les capacités.
 */
export function useExercisedCapability(): CapabilityName | null {
  const { data } = authClient.useSession();
  const context = useContext(ExercisedCapabilityContext);
  const { isCoach, isAthlete } = capabilitiesOf(data?.user);

  if (!isCoach || !isAthlete) return null;
  if (context?.override != null) return context.override;
  return data?.user.role === Role.ATHLETE ? "athlete" : "coach";
}

/**
 * De quoi câbler le sélecteur : le titre courant, la façon d'en changer, et `visible` — faux dès
 * que le compte ne cumule pas, seul cas où proposer un choix aurait un sens.
 */
export function useCapabilitySwitch(): {
  visible: boolean;
  current: CapabilityName | null;
  select: (capability: CapabilityName) => void;
} {
  const context = useContext(ExercisedCapabilityContext);
  const current = useExercisedCapability();
  return {
    visible: current != null,
    current,
    select: context?.setOverride ?? (() => undefined),
  };
}

/**
 * Le titre effectivement exercé — toujours une valeur, là où `useExercisedCapability` rend `null`
 * quand la question ne se pose pas.
 *
 * Pour la PRÉSENTATION des écrans servis aux deux capacités : leur titre, leurs textes de liste
 * vide, et ce qu'on peut y faire. Un compte à double capacité qui lit ses factures « en tant
 * qu'athlète » ne doit pas y voir l'en-tête du coach ni le bouton « marquer payée » — sa capacité
 * POSSÉDÉE dirait pourtant oui aux deux.
 *
 * Ce n'est pas une garde : qui entre est décidé par la route et le scope tenant. C'est ce que
 * l'écran montre une fois entré.
 */
export function useActingCapability(): CapabilityName {
  const exercised = useExercisedCapability();
  const { isCoach } = capabilitiesOf(authClient.useSession().data?.user);
  return exercised ?? (isCoach ? "coach" : "athlete");
}

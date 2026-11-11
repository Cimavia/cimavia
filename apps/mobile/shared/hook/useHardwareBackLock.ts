import { useEffect } from "react";
import { BackHandler } from "react-native";

/** Neutralise le retour système d'Android tant que `locked` est vrai. */
export function useHardwareBackLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [locked]);
}

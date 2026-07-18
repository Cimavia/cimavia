import { setAudioModeAsync } from "expo-audio";

/**
 * Mode audio par défaut de l'app : lecture autorisée même téléphone en silencieux (iOS), sinon les
 * notes vocales seraient muettes. Posé une fois, à l'import (comme le handler de notifications).
 * L'enregistreur bascule temporairement en mode « record » puis revient à cet état.
 */
setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
  // Best-effort : un mode audio non posé ne doit pas empêcher l'app de démarrer.
});

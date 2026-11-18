import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { RecordedAudio } from "@/shared/component";

/**
 * L'envoi des notes vocales d'une capture, débrief ou fil (#858).
 *
 * Depuis le relais au plafond (#856), une capture produit une note toutes les cinq minutes PENDANT
 * qu'elle continue : un second `mutate()` peut partir avant la fin du premier. TanStack observe
 * alors la seule dernière mutation — `error` et `isPending` ne parlaient plus que d'elle, et
 * l'échec d'une note partie plus tôt n'était plus dit.
 *
 * - **Les notes partent l'une après l'autre** (`scope`) : sur un lien faible, deux envois
 *   simultanés ne vont pas plus vite au total, et l'avancement affiché est celui d'une seule note.
 *   La dernière ne finit qu'après les autres : son `isPending` couvre toute la file.
 * - **L'échec est retenu ici**, par le `onError` des options, qui part pour CHAQUE note quel que
 *   soit l'observateur. Une note réussie ensuite ne l'efface pas : seul `clearError` le fait, que
 *   l'écran appelle au début d'une capture lancée à la main — jamais au relais.
 *
 * `scopeId` nomme la file : une par séance ou par fil, pour qu'une note n'attende que celles de
 * la même cible.
 */
export function useVoiceNoteUpload(
  scopeId: string,
  upload: (audio: RecordedAudio) => Promise<unknown>,
  onSuccess: () => void,
) {
  // `null` : aucune note de la file n'a échoué depuis la dernière capture.
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: upload,
    onSuccess,
    onError: (failure) => setError(failure),
    scope: { id: scopeId },
  });

  return {
    send: (audio: RecordedAudio) => mutation.mutate(audio),
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
}

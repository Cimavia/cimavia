import { createVoiceNoteFocus } from "@cmv/shared";

/**
 * La note vocale qui joue, UNE pour toute l'app (#529) : en lancer une autre la met en pause, où
 * qu'elle soit — les médias d'un débrief et ses réponses vivent sur le même écran. La règle vit dans
 * `@cmv/shared` (`voice-note.util`) ; ce module ne fait que la poser.
 */
export const voiceNoteFocus = createVoiceNoteFocus();

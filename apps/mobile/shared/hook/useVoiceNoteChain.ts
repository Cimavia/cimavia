import { createVoiceNoteChainHooks } from "@cmv/shared";
import { useState } from "react";

/**
 * Enchaîner les notes vocales d'une liste (#529) : à la fin d'une note, la suivante démarre. La
 * liste lui dit laquelle vient ensuite (`nextVoiceNoteInFeedback` ou `nextVoiceNoteInThread`).
 *
 * Règle et composition vivent dans `@cmv/shared` (`createVoiceNoteChainHooks`) ; le mobile n'y
 * apporte que son `useState`.
 */
export const { useVoiceNoteChain } = createVoiceNoteChainHooks(useState);

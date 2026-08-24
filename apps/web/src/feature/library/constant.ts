import { DOCUMENT_MIME_TYPES, INSTRUCTION_IMAGE_MIME_TYPES } from "@cmv/shared";

// Attribut `accept` de l'input file — dérivé de la source unique @cmv/shared (pas de duplication).
export const ACCEPTED_DOCUMENT_ATTR = DOCUMENT_MIME_TYPES.join(",");

// `accept` de l'input d'image de consigne — sous-ensemble images du même contrat partagé.
export const INSTRUCTION_IMAGE_ACCEPT = INSTRUCTION_IMAGE_MIME_TYPES.join(",");

import { DOCUMENT_MIME_TYPES } from "@cmv/shared";

// Attribut `accept` de l'input file — dérivé de la source unique @cmv/shared (pas de duplication).
export const ACCEPTED_DOCUMENT_ATTR = DOCUMENT_MIME_TYPES.join(",");

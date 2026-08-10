import { createMessageApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de la messagerie vivent dans @cmv/shared : le mobile appelle
// exactement les mêmes — quatre des six appels y étaient déjà identiques au caractère près.
// Ne reste ici que l'injection du client web (cookie de session du navigateur).
export const messageApi = createMessageApi(api);

export { messageKeys } from "@cmv/shared";

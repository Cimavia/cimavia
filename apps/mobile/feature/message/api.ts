import { createMessageApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de la messagerie vivent dans @cmv/shared : le web appelle
// exactement les mêmes. Ne reste ici que l'injection du client mobile (cookie SecureStore).
export const messageApi = createMessageApi(api);

export { messageKeys } from "@cmv/shared";

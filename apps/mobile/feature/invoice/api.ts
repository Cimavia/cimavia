import { createInvoiceApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache vivent dans @cmv/shared : le web appelle exactement les mêmes —
// `GET /invoices` est servie aux DEUX rôles, c'est le scope tenant qui décide de son contenu.
// Ne reste ici que l'injection du client mobile (cookie de session tenu par SecureStore).
export const invoiceApi = createInvoiceApi(api);

export { invoiceKeys } from "@cmv/shared";

import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// Sur mobile, le cookie de session est stocké chiffré (expo-secure-store) et réinjecté par expoClient.
// baseURL : sur appareil/émulateur, localhost ne pointe pas vers la machine hôte → utiliser l'IP LAN.
const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// Le scheme dépend de la variante de build (app.config.ts) : cimavia / cimavia-dev / cimavia-preview.
// Il doit correspondre à une origine de confiance côté API (voir apps/api/src/config/origins.ts).
const configuredScheme = Constants.expoConfig?.scheme;
const scheme =
  (Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme) ?? "cimavia";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme,
      storagePrefix: "cimavia",
      storage: SecureStore,
    }),
    /**
     * Ces déclarations sont ce qui fait exister les champs dans `useSession().data.user` : Better
     * Auth ne remonte que les `additionalFields` DÉCLARÉS. Sans les capacités ici, `capabilitiesOf`
     * rendrait « aucune capacité » à tout le monde — nav vide, redirections cassées — et ni `tsc`
     * ni le build ne le verraient (#9).
     */
    inferAdditionalFields({
      user: {
        isCoach: { type: "boolean", required: false },
        isAthlete: { type: "boolean", required: false },
        // `required: false` comme côté serveur depuis #12 : le signup n'envoie plus `role`, il est
        // DÉDUIT des capacités. Le déclarer requis ici le rendrait obligatoire à l'inscription.
        role: { type: "string", required: false },
        locale: { type: "string", required: false },
      },
    }),
  ],
});

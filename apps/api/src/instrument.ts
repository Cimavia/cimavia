import * as Sentry from "@sentry/nestjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as dotenv from "dotenv";

// Ce fichier DOIT être importé en premier dans main.ts — avant tout autre import
// Sentry instrumente les modules Node.js au chargement
// Si NestJS est chargé avant, certaines intégrations (Prisma, HTTP) ne fonctionneront pas
dotenv.config();

Sentry.init({
  // Le DSN identifie ton projet Sentry — vide en dev si SENTRY_DSN non configuré
  dsn: process.env.SENTRY_DSN || undefined,

  // Intégrations activées
  integrations: [
    // Profiling continu — flamegraphs de performance dans Sentry
    nodeProfilingIntegration(),
  ],

  // Taux d'échantillonnage des transactions de performance
  // 1.0 = 100% des transactions en dev pour tout voir
  // En prod : 0.1 (10%) pour réduire le volume
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // Taux d'échantillonnage du profiling (subset des transactions tracées)
  profilesSampleRate: 1,

  // Environnement — apparaît dans le dashboard Sentry pour filtrer les issues
  environment: process.env.NODE_ENV || "development",

  // Ne pas envoyer d'events si pas de DSN configuré (dev sans compte Sentry)
  enabled: !!process.env.SENTRY_DSN,

  sendDefaultPii: true,
});

/**
 * `import.meta.glob`, que Vite (donc Vitest) résout à la transformation — l'entrée de la suite
 * d'isolation s'en sert pour charger chaque domaine (#625). Ses types vivent dans `vite/client`,
 * dont l'API ne dépend pas directement : seule la forme utilisée est déclarée.
 */
interface ImportMeta {
  glob(pattern: string, options: { eager: true }): Record<string, unknown>;
}

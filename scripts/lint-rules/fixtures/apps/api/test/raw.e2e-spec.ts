declare const prisma: { $executeRawUnsafe: (sql: string) => Promise<unknown> };

// Les e2e remettent la base à zéro en SQL brut : hors périmètre.
export const reset = () => prisma.$executeRawUnsafe("TRUNCATE plan CASCADE");

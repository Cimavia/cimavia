declare const prisma: {
  $queryRaw: (...args: unknown[]) => Promise<unknown>;
  $executeRaw: (...args: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
  $queryRawTyped: (query: unknown) => Promise<unknown>;
  $transaction: (ops: unknown[]) => Promise<unknown>;
};

export async function demo(id: string) {
  await prisma.$queryRaw`SELECT * FROM plan WHERE id = ${id}`; // ✗ noRawSql
  await prisma.$executeRaw`DELETE FROM plan WHERE id = ${id}`; // ✗ noRawSql
  await prisma.$queryRawUnsafe("SELECT 1"); // ✗ noRawSql
  await prisma.$executeRawUnsafe("TRUNCATE plan"); // ✗ noRawSql
  await prisma.$queryRawTyped({}); // ✗ noRawSql
  await prisma["$queryRaw"]`SELECT 1`; // ✗ noRawSql
  const { $executeRawUnsafe } = prisma; // ✗ noRawSql
  const { $queryRaw: raw } = prisma; // ✗ noRawSql
  await prisma.$transaction([$executeRawUnsafe, raw]);
  // biome-ignore lint/plugin/noRawSql: exception déclarée, avec sa raison
  await prisma.$queryRaw`SELECT 1`;
}

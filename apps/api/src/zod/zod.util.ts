import { BadRequestException } from "@nestjs/common";
import type { ZodType } from "zod";

// Une classe DTO fabriquée par createZodDto porte son schéma Zod en statique.
export type ZodDtoClass = { schema: ZodType };

// Valide `data` contre `schema` et renvoie la donnée typée, ou lève une 400 avec des
// erreurs structurées ({ path, message }) exploitables côté client (i18n).
export function zodSafeParse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new BadRequestException(errors);
  }
  return result.data;
}

/**
 * Fabrique une classe DTO à partir d'un schéma Zod partagé (@cmv/shared).
 * Le schéma vit dans @cmv/shared (partagé front↔back) ; cette classe n'est qu'un wrapper
 * NestJS pour que le pipe global (ZodBodyValidationPipe) valide via le metatype.
 * Usage : `class CreateInvitationDto extends createZodDto(createInvitationSchema) {}`.
 */
export function createZodDto<T>(schema: ZodType<T>) {
  // biome-ignore lint/complexity/noStaticOnlyClass: wrapper DTO — la classe sert de metatype porteur du schéma pour le pipe global.
  class ZodDto {
    static readonly schema = schema;
  }
  return ZodDto as unknown as { new (): T; schema: ZodType<T> };
}

export function hasSchema(metatype: unknown): metatype is ZodDtoClass {
  return typeof metatype === "function" && "schema" in metatype;
}

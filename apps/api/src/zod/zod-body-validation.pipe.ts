import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import { hasSchema, zodSafeParse } from "./zod.util";

/**
 * Pipe global (branché dans main.ts) : valide automatiquement tout argument dont le type est
 * une classe DTO fabriquée par createZodDto (elle porte un `schema` statique). Fail-safe :
 * plus besoin de câbler un pipe par route → une entrée typée par un DTO est toujours validée.
 * Les autres arguments (primitifs, session…) passent sans transformation.
 */
@Injectable()
export class ZodBodyValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const { metatype } = metadata;
    if (!hasSchema(metatype)) {
      return value;
    }
    return zodSafeParse(metatype.schema, value);
  }
}

import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { zodSafeParse } from "./zod.util";

/**
 * Pipe validant une entrée contre un schéma Zod fourni explicitement — à appliquer par route
 * (`@Body(new ZodSchemaPipe(schema))`). Complète le pipe global (metatype) pour les schémas
 * qui ne peuvent pas être portés par une classe DTO, notamment les unions discriminées.
 */
export class ZodSchemaPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return zodSafeParse(this.schema, value);
  }
}

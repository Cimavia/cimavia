import type { StructureDto } from "@cmv/shared";
import type { Structure } from "@prisma/client";
import { parseSettings } from "../util/block-json.util";

export function toStructureDto(structure: Structure, sessionCount: number): StructureDto {
  return {
    id: structure.id,
    name: structure.name,
    tags: structure.tags,
    note: structure.note,
    instructions: structure.instructions,
    settings: parseSettings(structure.settings),
    sessionCount,
    createdAt: structure.createdAt.toISOString(),
    updatedAt: structure.updatedAt.toISOString(),
  };
}

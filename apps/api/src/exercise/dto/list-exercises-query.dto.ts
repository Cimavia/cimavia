import { listExercisesQuerySchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ListExercisesQueryDto extends createZodDto(listExercisesQuerySchema) {}

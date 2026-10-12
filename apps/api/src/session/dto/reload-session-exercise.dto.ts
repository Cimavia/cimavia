import { reloadSessionExerciseSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ReloadSessionExerciseDto extends createZodDto(reloadSessionExerciseSchema) {}

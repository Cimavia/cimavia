import { updateAthleteSheetSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateAthleteSheetDto extends createZodDto(updateAthleteSheetSchema) {}

import { requestUploadUrlSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class RequestUploadUrlDto extends createZodDto(requestUploadUrlSchema) {}

import { requestInvoiceDocumentUploadUrlSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class RequestInvoiceDocumentUploadUrlDto extends createZodDto(
  requestInvoiceDocumentUploadUrlSchema,
) {}

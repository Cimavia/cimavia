import { attachInvoiceDocumentSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class AttachInvoiceDocumentDto extends createZodDto(attachInvoiceDocumentSchema) {}

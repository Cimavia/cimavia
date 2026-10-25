import { type VersionQuery, versionQuerySchema } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { CreateStructureDto } from "../dto/create-structure.dto";
import { UpdateStructureDto } from "../dto/update-structure.dto";
import { StructureService } from "../service/structure.service";

@ApiTags("structures")
@RequireCapability("coach")
@Controller("structures")
export class StructureController {
  constructor(private readonly structures: StructureService) {}

  /** La bibliothèque : les structures prêtes, puis celles du Coach, chacune avec son compteur. */
  @Get()
  library() {
    return this.structures.library();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.structures.get(id);
  }

  @Post()
  create(@Body() dto: CreateStructureDto) {
    return this.structures.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStructureDto) {
    return this.structures.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(
    @Param("id") id: string,
    @Query(new ZodSchemaPipe(versionQuerySchema)) query: VersionQuery,
  ) {
    return this.structures.delete(id, query);
  }
}

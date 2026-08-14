import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { resourceKinds, type ResourceKind } from "@mimorii/contracts";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateResourceDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: resourceKinds })
  @IsIn(resourceKinds)
  kind!: ResourceKind;

  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @Length(1, 2048)
  target!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  agentId?: string | null;
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {}

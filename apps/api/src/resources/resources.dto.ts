import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { resourceKinds, type ResourceKind } from "@mimorii/contracts";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateResourceDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: resourceKinds })
  @IsIn(resourceKinds)
  kind!: ResourceKind;

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

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2_000 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(2_000)
  logQuery?: string | null;
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {}

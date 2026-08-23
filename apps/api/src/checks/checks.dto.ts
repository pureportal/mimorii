import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { checkTypes, type CheckType } from "@mimorii/contracts";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class CheckExecutionDto {
  @ApiProperty({ enum: ["direct", "agent"] })
  @IsIn(["direct", "agent"])
  kind!: "direct" | "agent";

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class CreateCheckDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  resourceId!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: checkTypes })
  @IsIn(checkTypes)
  type!: CheckType;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiProperty({ type: CheckExecutionDto })
  @IsObject()
  execution!: CheckExecutionDto;

  @ApiPropertyOptional({ nullable: true, maxLength: 2048 })
  @IsOptional()
  @IsString()
  @Length(0, 2048)
  secret?: string | null;

  @ApiPropertyOptional({ default: 60, minimum: 30, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86_400)
  intervalSeconds?: number;

  @ApiPropertyOptional({ default: 5000, minimum: 250, maximum: 30000 })
  @IsOptional()
  @IsInt()
  @Min(250)
  @Max(30_000)
  timeoutMs?: number;

  @ApiPropertyOptional({ default: 2, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  failureThreshold?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  recoveryThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateCheckDto extends PartialType(CreateCheckDto) {}

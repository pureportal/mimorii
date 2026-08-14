import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class CreateHeartbeatMonitorDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  resourceId!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ minimum: 60, maximum: 2_592_000, default: 300 })
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  intervalSeconds!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 86_400, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  graceSeconds?: number;

  @ApiPropertyOptional({ minimum: 60, maximum: 2_592_000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  maxRuntimeSeconds?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateHeartbeatMonitorDto extends PartialType(CreateHeartbeatMonitorDto) {}

export class HeartbeatSignalDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  message?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 2_592_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_592_000_000)
  durationMs?: number;

  @ApiPropertyOptional({ additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

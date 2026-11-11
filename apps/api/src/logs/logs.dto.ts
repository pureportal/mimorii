import {
  incidentImpacts,
  logAlertComparisons,
  logAlertPendingSeconds,
  logAlertWindowSeconds,
  logQueryDirections,
  logQueryLimits,
  logQueryMaxEntries,
  logRetentionDayOptions,
  logSavedSearchLimits,
  type IncidentImpact,
  type LogAlertComparison,
  type LogQueryDirection,
} from "@mimorii/contracts";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class LogRangeQueryDto {
  @ApiPropertyOptional({ maxLength: logQueryLimits.queryLength })
  @IsOptional()
  @IsString()
  @MaxLength(logQueryLimits.queryLength)
  query?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class LogEntriesQueryDto extends LogRangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: logQueryMaxEntries, default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(logQueryMaxEntries)
  limit?: number;

  @ApiPropertyOptional({ enum: logQueryDirections, default: "backward" })
  @IsOptional()
  @IsIn(logQueryDirections)
  direction?: LogQueryDirection;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cursor?: string;
}

export class LogPatternsQueryDto extends LogRangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class LogContextQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateTeamLogSettingsDto {
  @ApiProperty({ enum: logRetentionDayOptions })
  @IsIn(logRetentionDayOptions)
  retentionDays!: number;
}

export class CreateLogSourceDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: { type: "string" } })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

export class UpdateLogSourceDto extends PartialType(CreateLogSourceDto) {}

export class PreviewLogAlertRuleDto {
  @ApiProperty({ maxLength: logQueryLimits.queryLength })
  @IsString()
  @MaxLength(logQueryLimits.queryLength)
  query!: string;

  @ApiProperty({ enum: logAlertWindowSeconds })
  @IsIn(logAlertWindowSeconds)
  windowSeconds!: number;

  @ApiProperty({ enum: logAlertComparisons })
  @IsIn(logAlertComparisons)
  comparison!: LogAlertComparison;

  @ApiProperty({ minimum: 1, maximum: 100_000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  threshold!: number;
}

export class CreateLogAlertRuleDto extends PreviewLogAlertRuleDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: incidentImpacts })
  @IsIn(incidentImpacts)
  impact!: IncidentImpact;

  @ApiPropertyOptional({ enum: logAlertPendingSeconds, default: 0 })
  @IsOptional()
  @IsIn(logAlertPendingSeconds)
  pendingSeconds?: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  resourceId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoResolve?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateLogAlertRuleDto extends PartialType(CreateLogAlertRuleDto) {}

export class CreateLogSavedSearchDto {
  @ApiProperty({ minLength: 1, maxLength: logSavedSearchLimits.name })
  @IsString()
  @Length(1, logSavedSearchLimits.name)
  name!: string;

  @ApiProperty({ maxLength: logQueryLimits.queryLength })
  @IsString()
  @MaxLength(logQueryLimits.queryLength)
  query!: string;
}

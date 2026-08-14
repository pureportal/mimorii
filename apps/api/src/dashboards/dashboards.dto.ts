import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  dashboardAccessModes,
  dashboardIncidentLimits,
  dashboardItemTypes,
  dashboardMetrics,
  dashboardWidths,
  dashboardWindowDays,
  type DashboardAccessMode,
  type DashboardIncidentLimit,
  type DashboardItemType,
  type DashboardMetric,
  type DashboardWidth,
  type DashboardWindowDays,
} from "@mimorii/contracts";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

export class DashboardItemDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;

  @ApiProperty({ enum: dashboardItemTypes })
  @IsIn(dashboardItemTypes)
  type!: DashboardItemType;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  title!: string;

  @ApiProperty({ enum: dashboardWidths })
  @IsIn(dashboardWidths)
  width!: DashboardWidth;

  @ApiPropertyOptional({ enum: dashboardMetrics })
  @IsOptional()
  @IsIn(dashboardMetrics)
  metric?: DashboardMetric;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  resourceId?: string | null;

  @ApiPropertyOptional({ enum: dashboardWindowDays })
  @IsOptional()
  @IsIn(dashboardWindowDays)
  windowDays?: DashboardWindowDays;

  @ApiPropertyOptional({ enum: dashboardIncidentLimits })
  @IsOptional()
  @IsIn(dashboardIncidentLimits)
  limit?: DashboardIncidentLimit;
}

export class CreateDashboardDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ minLength: 3, maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ enum: dashboardAccessModes })
  @IsIn(dashboardAccessModes)
  accessMode!: DashboardAccessMode;

  @ApiProperty({ type: [DashboardItemDto], maxItems: 24 })
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => DashboardItemDto)
  items!: DashboardItemDto[];
}

export class UpdateDashboardDto extends PartialType(CreateDashboardDto) {}

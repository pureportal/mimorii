import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { maintenanceRecurrences, type MaintenanceRecurrence } from "@mimorii/contracts";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";

export class CreateMaintenanceDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty()
  @IsISO8601()
  startsAt!: string;

  @ApiProperty()
  @IsISO8601()
  endsAt!: string;

  @ApiPropertyOptional({ enum: maintenanceRecurrences, default: "none" })
  @IsOptional()
  @IsIn(maintenanceRecurrences)
  recurrence?: MaintenanceRecurrence;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  recurrenceUntil?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  suppressNotifications?: boolean;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  resourceIds!: string[];
}

export class UpdateMaintenanceDto extends PartialType(CreateMaintenanceDto) {}

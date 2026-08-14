import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  incidentImpacts,
  incidentStatuses,
  type IncidentImpact,
  type IncidentStatus,
} from "@mimorii/contracts";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";

export class CreateIncidentDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty({ enum: incidentImpacts })
  @IsIn(incidentImpacts)
  impact!: IncidentImpact;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  resourceIds!: string[];

  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  @IsString()
  @Length(1, 2_000)
  message!: string;

  @ApiPropertyOptional({ enum: ["investigating", "identified", "monitoring"] })
  @IsOptional()
  @IsIn(["investigating", "identified", "monitoring"])
  status?: Exclude<IncidentStatus, "resolved">;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startedAt?: string;
}

export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {}

export class AddIncidentUpdateDto {
  @ApiProperty({ enum: incidentStatuses })
  @IsIn(incidentStatuses)
  status!: IncidentStatus;

  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  @IsString()
  @Length(1, 2_000)
  message!: string;
}

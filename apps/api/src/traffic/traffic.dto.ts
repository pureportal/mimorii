import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { trafficDevices, type TrafficDevice } from "@mimorii/contracts";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateTrafficSiteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  resourceId!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  domains?: string[];
}

export class UpdateTrafficSiteDto {
  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  domains?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  heatmapsEnabled?: boolean;
}

export class CreateHeatmapLinkDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @Length(1, 300)
  @Matches(/^\//)
  path!: string;

  @ApiProperty({ enum: trafficDevices })
  @IsIn(trafficDevices)
  device!: TrafficDevice;
}

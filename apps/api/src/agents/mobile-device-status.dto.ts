import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  mobileBatteryHealthValues,
  mobileBatteryPowerSources,
  mobileNetworkTransports,
  mobileThermalStatuses,
  type MobileBatteryHealth,
  type MobileBatteryPowerSource,
  type MobileNetworkTransport,
  type MobileThermalStatus,
} from "@mimorii/contracts";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

class MobileDeviceIdentityDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  manufacturer!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  model!: string;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @Length(1, 40)
  androidRelease!: string;

  @ApiProperty({ minimum: 24, maximum: 100 })
  @IsInt()
  @Min(24)
  @Max(100)
  apiLevel!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  securityPatch!: string | null;
}

class MobileCollectorBuildDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @Length(1, 40)
  appVersion!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  buildNumber!: number;
}

class MobileBatteryStatusDto {
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  charging!: boolean | null;

  @ApiProperty({ enum: mobileBatteryPowerSources })
  @IsIn(mobileBatteryPowerSources)
  powerSource!: MobileBatteryPowerSource;

  @ApiPropertyOptional({ nullable: true, enum: mobileBatteryHealthValues })
  @IsOptional()
  @IsIn(mobileBatteryHealthValues)
  health!: MobileBatteryHealth | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: -100,
    maximum: 200,
  })
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(200)
  temperatureCelsius!: number | null;
}

class MobileMemoryStatusDto {
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  totalBytes!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  availableBytes!: number;

  @ApiProperty()
  @IsBoolean()
  lowMemory!: boolean;
}

class MobileStorageStatusDto {
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  totalBytes!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  availableBytes!: number;
}

class MobileConnectivityStatusDto {
  @ApiProperty()
  @IsBoolean()
  connected!: boolean;

  @ApiProperty()
  @IsBoolean()
  internetValidated!: boolean;

  @ApiProperty()
  @IsBoolean()
  metered!: boolean;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  roaming!: boolean | null;

  @ApiProperty()
  @IsBoolean()
  vpn!: boolean;

  @ApiProperty({ enum: mobileNetworkTransports })
  @IsIn(mobileNetworkTransports)
  transport!: MobileNetworkTransport;
}

class MobilePowerStatusDto {
  @ApiProperty()
  @IsBoolean()
  batterySaver!: boolean;

  @ApiProperty()
  @IsBoolean()
  deviceIdle!: boolean;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  backgroundRestricted!: boolean | null;
}

export class MobileDeviceStatusDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  collectorId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  submissionId!: string;

  @ApiProperty({ enum: [1] })
  @IsIn([1])
  schemaVersion!: 1;

  @ApiProperty()
  @IsISO8601()
  observedAt!: string;

  @ApiProperty({ type: MobileDeviceIdentityDto })
  @ValidateNested()
  @Type(() => MobileDeviceIdentityDto)
  device!: MobileDeviceIdentityDto;

  @ApiProperty({ type: MobileCollectorBuildDto })
  @ValidateNested()
  @Type(() => MobileCollectorBuildDto)
  collector!: MobileCollectorBuildDto;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  uptimeSeconds!: number;

  @ApiProperty({ type: MobileBatteryStatusDto })
  @ValidateNested()
  @Type(() => MobileBatteryStatusDto)
  battery!: MobileBatteryStatusDto;

  @ApiProperty({ type: MobileMemoryStatusDto })
  @ValidateNested()
  @Type(() => MobileMemoryStatusDto)
  memory!: MobileMemoryStatusDto;

  @ApiProperty({ type: MobileStorageStatusDto })
  @ValidateNested()
  @Type(() => MobileStorageStatusDto)
  storage!: MobileStorageStatusDto;

  @ApiProperty({ type: MobileConnectivityStatusDto })
  @ValidateNested()
  @Type(() => MobileConnectivityStatusDto)
  connectivity!: MobileConnectivityStatusDto;

  @ApiProperty({ type: MobilePowerStatusDto })
  @ValidateNested()
  @Type(() => MobilePowerStatusDto)
  power!: MobilePowerStatusDto;

  @ApiPropertyOptional({ nullable: true, enum: mobileThermalStatuses })
  @IsOptional()
  @IsIn(mobileThermalStatuses)
  thermalStatus!: MobileThermalStatus | null;
}

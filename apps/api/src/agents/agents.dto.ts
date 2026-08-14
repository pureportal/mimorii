import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { agentCollectionInterval } from "@mimorii/contracts";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateAgentDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({
    default: agentCollectionInterval.defaultSeconds,
    minimum: agentCollectionInterval.minimumSeconds,
    maximum: agentCollectionInterval.maximumSeconds,
  })
  @IsOptional()
  @IsInt()
  @Min(agentCollectionInterval.minimumSeconds)
  @Max(agentCollectionInterval.maximumSeconds)
  collectionIntervalSeconds?: number;
}

export class UpdateAgentDto {
  @ApiProperty({
    minimum: agentCollectionInterval.minimumSeconds,
    maximum: agentCollectionInterval.maximumSeconds,
  })
  @IsInt()
  @Min(agentCollectionInterval.minimumSeconds)
  @Max(agentCollectionInterval.maximumSeconds)
  collectionIntervalSeconds!: number;
}

export class DiskSnapshotDto {
  @ApiProperty()
  @IsString()
  @Length(1, 260)
  mount!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  usedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalBytes!: number;
}

export class TechnologySnapshotDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({
    enum: ["runtime", "framework", "database", "proxy", "container", "protocol", "other"],
  })
  @IsIn(["runtime", "framework", "database", "proxy", "container", "protocol", "other"])
  category!: "runtime" | "framework" | "database" | "proxy" | "container" | "protocol" | "other";

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  version?: string | null;
}

export class HostSnapshotDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  hostname!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  platform!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 40)
  version!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  uptimeSeconds!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuPercent!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  loadAverage!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  memoryUsedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  memoryTotalBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  swapUsedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  swapTotalBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  processCount!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  networkReceivedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  networkTransmittedBytes!: number;

  @ApiProperty({ type: [DiskSnapshotDto] })
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => DiskSnapshotDto)
  disks!: DiskSnapshotDto[];

  @ApiProperty({ type: [TechnologySnapshotDto] })
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => TechnologySnapshotDto)
  technologies!: TechnologySnapshotDto[];

  @ApiProperty()
  @IsISO8601()
  observedAt!: string;
}

export class AgentTaskResultDto {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  taskId!: string;

  @ApiProperty({ enum: ["up", "degraded", "down"] })
  @IsIn(["up", "degraded", "down"])
  status!: "up" | "degraded" | "down";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  latencyMs?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(599)
  statusCode?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  message?: string | null;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  metrics!: Record<string, number | string | boolean | null>;

  @ApiProperty()
  @IsISO8601()
  checkedAt!: string;
}

export class AgentHeartbeatDto {
  @ApiProperty({ type: [HostSnapshotDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HostSnapshotDto)
  snapshots!: HostSnapshotDto[];

  @ApiProperty({ type: [AgentTaskResultDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AgentTaskResultDto)
  results!: AgentTaskResultDto[];

  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  capabilities!: string[];
}

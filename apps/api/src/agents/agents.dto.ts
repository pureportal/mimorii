import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  agentCollectionInterval,
  agentCapabilities,
  agentKinds,
  type AgentKind,
} from "@mimorii/contracts";
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
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateAgentDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ enum: agentKinds })
  @IsIn(agentKinds)
  kind!: AgentKind;

  @ApiPropertyOptional({
    minimum: agentCollectionInterval.minimumSeconds,
    maximum: agentCollectionInterval.maximumSeconds,
    description: "Defaults to 30 seconds for desktop agents and 900 seconds for mobile agents.",
  })
  @IsOptional()
  @IsInt()
  @Min(agentCollectionInterval.minimumSeconds)
  @Max(agentCollectionInterval.maximumSeconds)
  collectionIntervalSeconds?: number;
}

export class UpdateAgentDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional({
    minimum: agentCollectionInterval.minimumSeconds,
    maximum: agentCollectionInterval.maximumSeconds,
  })
  @IsOptional()
  @IsInt()
  @Min(agentCollectionInterval.minimumSeconds)
  @Max(agentCollectionInterval.maximumSeconds)
  collectionIntervalSeconds?: number;
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

export class ContainerSnapshotDto {
  @ApiProperty()
  @IsString()
  @Length(12, 128)
  id!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  image!: string;

  @ApiProperty({
    enum: ["created", "running", "paused", "restarting", "exited", "dead", "unknown"],
  })
  @IsIn(["created", "running", "paused", "restarting", "exited", "dead", "unknown"])
  state!: "created" | "running" | "paused" | "restarting" | "exited" | "dead" | "unknown";

  @ApiProperty({ enum: ["healthy", "unhealthy", "starting", "none"] })
  @IsIn(["healthy", "unhealthy", "starting", "none"])
  health!: "healthy" | "unhealthy" | "starting" | "none";

  @ApiProperty()
  @IsInt()
  @Min(0)
  restartCount!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  cpuPercent!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  memoryUsedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  memoryLimitBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  networkReceivedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  networkTransmittedBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  blockReadBytes!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  blockWrittenBytes!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  composeProject!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  composeService!: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(128)
  @IsString({ each: true })
  ports!: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  startedAt!: string | null;
}

export class ContainerRuntimeSnapshotDto {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  engineVersion!: string;

  @ApiProperty({ type: [ContainerSnapshotDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ContainerSnapshotDto)
  containers!: ContainerSnapshotDto[];
}

export class HostSnapshotDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  snapshotId!: string;

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

  @ApiPropertyOptional({ type: ContainerRuntimeSnapshotDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContainerRuntimeSnapshotDto)
  containerRuntime!: ContainerRuntimeSnapshotDto | null;

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

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  latencyMs?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(599)
  statusCode?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
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
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @IsString()
  @Length(1, 40)
  agentVersion!: string;

  @ApiProperty({ type: [HostSnapshotDto] })
  @IsArray()
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
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsIn(agentCapabilities, { each: true })
  capabilities!: string[];
}

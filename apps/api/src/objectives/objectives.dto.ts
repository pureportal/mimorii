import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";

export class CreateObjectiveDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  resourceId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  checkId?: string | null;

  @ApiProperty({ minimum: 90, maximum: 99.999 })
  @IsNumber()
  @Min(90)
  @Max(99.999)
  targetPercent!: number;

  @ApiProperty({ enum: [7, 30, 90] })
  @IsIn([7, 30, 90])
  windowDays!: 7 | 30 | 90;

  @ApiPropertyOptional({ minimum: 1, maximum: 300_000, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300_000)
  latencyTargetMs?: number | null;
}

export class UpdateObjectiveDto extends PartialType(CreateObjectiveDto) {}

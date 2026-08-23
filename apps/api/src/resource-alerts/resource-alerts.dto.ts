import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  resourceAlertMetrics,
  resourceAlertOperators,
  type ResourceAlertMetric,
  type ResourceAlertOperator,
} from "@mimorii/contracts";
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class CreateResourceAlertDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: resourceAlertMetrics })
  @IsIn(resourceAlertMetrics)
  metric!: ResourceAlertMetric;

  @ApiProperty({ enum: resourceAlertOperators })
  @IsIn(resourceAlertOperators)
  operator!: ResourceAlertOperator;

  @ApiProperty({ oneOf: [{ type: "number" }, { type: "boolean" }] })
  @IsDefined()
  threshold!: number | boolean;

  @ApiPropertyOptional({ nullable: true, oneOf: [{ type: "number" }, { type: "boolean" }] })
  @IsOptional()
  recoveryThreshold?: number | boolean | null;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  requiredSamples?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateResourceAlertDto extends PartialType(CreateResourceAlertDto) {}

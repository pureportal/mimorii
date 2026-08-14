import {
  sponsorshipApplicationStatuses,
  sponsorshipTiers,
  type SponsorshipApplicationStatus,
  type SponsorshipTier,
} from "@mimorii/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

export class UpdateGlobalUserAccessDto {
  @ApiProperty()
  @IsBoolean()
  isGlobalAdmin!: boolean;

  @ApiProperty()
  @IsBoolean()
  disabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  expectedIsGlobalAdmin!: boolean;

  @ApiProperty()
  @IsBoolean()
  expectedDisabled!: boolean;
}

export class UpdatePlatformSettingsDto {
  @ApiProperty()
  @IsBoolean()
  registrationEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  sponsorshipApplicationsEnabled!: boolean;

  @ApiProperty({ minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  sponsorshipApplicationRetentionDays!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class ReviewSponsorshipApplicationDto {
  @ApiProperty({ enum: sponsorshipApplicationStatuses })
  @IsIn(sponsorshipApplicationStatuses)
  status!: SponsorshipApplicationStatus;

  @ApiProperty({ enum: sponsorshipApplicationStatuses })
  @IsIn(sponsorshipApplicationStatuses)
  expectedStatus!: SponsorshipApplicationStatus;
}

export class CreateSponsorDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ enum: sponsorshipTiers })
  @IsIn(sponsorshipTiers)
  tier!: SponsorshipTier;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2048 })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Length(8, 2048)
  websiteUrl?: string | null;

  @ApiProperty()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  published!: boolean;
}

export class UpdateSponsorDto extends CreateSponsorDto {
  @ApiProperty()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  removeFavicon?: boolean;
}

export class ReorderSponsorsDto {
  @ApiProperty({ enum: sponsorshipTiers })
  @IsIn(sponsorshipTiers)
  tier!: SponsorshipTier;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 1000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  sponsorIds!: string[];
}

export class DeleteSponsorDto {
  @ApiProperty()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}

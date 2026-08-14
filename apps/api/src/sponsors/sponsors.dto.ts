import { sponsorshipTiers, type SponsorshipTier } from "@mimorii/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";

export class CreateSponsorshipApplicationDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  @Matches(/\S/)
  organizationName!: string;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  @Matches(/\S/)
  contactName!: string;

  @ApiProperty({ maxLength: 320 })
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Length(8, 2048)
  websiteUrl?: string;

  @ApiProperty({ enum: sponsorshipTiers })
  @IsIn(sponsorshipTiers)
  tier!: SponsorshipTier;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Matches(/\S/)
  message?: string;
}

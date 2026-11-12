import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateStatusPageDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ minLength: 3, maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  resourceIds!: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  showUptime?: boolean;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ nullable: true, pattern: "^#[0-9a-f]{6}$" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9a-f]{6}$/, { message: "Accent color must be a hex color such as #ff7a90" })
  accentColor?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(500)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;
}

export class UpdateStatusPageDto extends PartialType(CreateStatusPageDto) {}

export class SubscribeStatusPageDto {
  @ApiProperty()
  @IsEmail()
  @Length(3, 320)
  email!: string;
}

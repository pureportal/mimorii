import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "Aiko Tanaka", maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ example: "aiko@example.com" })
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  @Matches(/[a-z]/, { message: "Password must include a lowercase letter" })
  @Matches(/[A-Z]/, { message: "Password must include an uppercase letter" })
  @Matches(/[0-9]/, { message: "Password must include a number" })
  password!: string;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @Equals(true, { message: "You must accept the Terms of Use" })
  acceptedTerms!: true;
}

export class LoginDto {
  @ApiProperty({ example: "aiko@example.com" })
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name!: string;
}

export class TourAcknowledgementParamsDto {
  @ApiProperty({ example: "overview", maxLength: 100 })
  @IsString()
  @Length(1, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  tourId!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  @Matches(/[a-z]/, { message: "Password must include a lowercase letter" })
  @Matches(/[A-Z]/, { message: "Password must include an uppercase letter" })
  @Matches(/[0-9]/, { message: "Password must include a number" })
  newPassword!: string;
}

export class CreateApiTokenDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ enum: [30, 90, 365], nullable: true, default: 90 })
  @IsOptional()
  @IsIn([30, 90, 365])
  expiresInDays?: 30 | 90 | 365 | null;
}

export class RefreshSessionDto {
  @ApiProperty({ minLength: 32, maxLength: 128 })
  @IsString()
  @Length(32, 128)
  refreshToken!: string;
}

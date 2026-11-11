import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class TwoFactorChallengeDto {
  @ApiProperty({ minLength: 32, maxLength: 128 })
  @IsString()
  @Length(32, 128)
  challengeToken!: string;

  @ApiProperty({ description: "Authenticator or recovery code", minLength: 6, maxLength: 32 })
  @IsString()
  @Length(6, 32)
  code!: string;
}

export class TwoFactorStepUpDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;

  @ApiProperty({ description: "Authenticator or recovery code", minLength: 6, maxLength: 32 })
  @IsString()
  @Length(6, 32)
  code!: string;
}

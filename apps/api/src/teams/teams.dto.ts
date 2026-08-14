import { ApiProperty } from "@nestjs/swagger";
import { teamRoles, type TeamRole } from "@mimorii/contracts";
import { IsEmail, IsIn, IsString, IsUUID, Length } from "class-validator";

export class CreateTeamDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;
}

export class UpdateTeamDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;
}

export class DeleteTeamDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;
}

export class InviteMemberDto {
  @ApiProperty()
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @ApiProperty({ enum: ["admin", "member", "viewer"] })
  @IsIn(["admin", "member", "viewer"])
  role!: Exclude<TeamRole, "owner">;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: teamRoles })
  @IsIn(teamRoles)
  role!: TeamRole;
}

export class AcceptInviteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  teamId!: string;
}

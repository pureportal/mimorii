import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  PartialType,
} from "@nestjs/swagger";
import {
  notificationChannelTypes,
  notificationConditionOperators,
  notificationEvents,
  type NotificationChannelType,
  type NotificationCondition,
  type NotificationConditionGroup as NotificationConditionGroupContract,
  type NotificationConditionOperator,
  type NotificationConditionValue,
  type NotificationEvent,
} from "@mimorii/contracts";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  ValidateIf,
} from "class-validator";

export class CreateNotificationChannelDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: notificationChannelTypes })
  @IsIn(notificationChannelTypes)
  type!: NotificationChannelType;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @ValidateIf((input: CreateNotificationChannelDto) => input.type === "email")
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  emailRecipients?: string[];

  @ApiPropertyOptional()
  @ValidateIf((input: CreateNotificationChannelDto) => input.type === "webhook")
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Length(1, 2048)
  webhookUrl?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  webhookSecret?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 100 })
  @ValidateIf((input: CreateNotificationChannelDto) => input.type === "push")
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  pushUserIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotificationChannelDto extends PartialType(CreateNotificationChannelDto) {}

class NotificationConditionDto implements NotificationCondition {
  @ApiProperty({ enum: ["condition"] })
  kind!: "condition";

  @ApiProperty({ minLength: 1, maxLength: 100 })
  field!: string;

  @ApiProperty({ enum: notificationConditionOperators })
  operator!: NotificationConditionOperator;

  @ApiPropertyOptional({
    nullable: true,
    oneOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
      {
        type: "array",
        items: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
    ],
  })
  value?: NotificationConditionValue;
}

class NotificationConditionGroupDto implements NotificationConditionGroupContract {
  @ApiProperty({ enum: ["group"] })
  kind!: "group";

  @ApiProperty({ enum: ["and", "or"] })
  operator!: "and" | "or";

  @ApiProperty({
    type: "array",
    maxItems: 50,
    items: {
      oneOf: [
        { $ref: getSchemaPath(NotificationConditionDto) },
        { $ref: getSchemaPath(NotificationConditionGroupDto) },
      ],
    },
  })
  conditions!: Array<NotificationCondition | NotificationConditionGroupContract>;
}

@ApiExtraModels(NotificationConditionDto, NotificationConditionGroupDto)
export class CreateNotificationPolicyDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: notificationEvents, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(notificationEvents.length)
  @ArrayUnique()
  @IsIn(notificationEvents, { each: true })
  events!: NotificationEvent[];

  @ApiProperty({ allOf: [{ $ref: getSchemaPath(NotificationConditionGroupDto) }] })
  @IsObject()
  condition!: NotificationConditionGroupContract;

  @ApiProperty({ type: [String], format: "uuid", maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  channelIds!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotificationPolicyDto extends PartialType(CreateNotificationPolicyDto) {}

export class RegisterWebPushEndpointDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  deviceKey!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  subscription!: Record<string, unknown>;
}

export class RegisterAndroidEndpointDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  deviceKey!: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  @IsString()
  @Length(10, 300)
  installationId!: string;
}

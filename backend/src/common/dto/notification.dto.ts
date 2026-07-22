import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export class NotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;
}

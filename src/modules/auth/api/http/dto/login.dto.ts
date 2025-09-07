import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'docente@gmail.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'Secreta123' })
    @IsString()
    @MinLength(6)
    password: string;
}

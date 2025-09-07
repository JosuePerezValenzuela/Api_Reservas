import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccessTokenStrategy } from './infra/jwt/access-token.strategy';
import { AuthController } from './api/http/auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { People } from '../../infra/db/typeorm/entities/people.entity';
import { AuthPeople } from '../../infra/db/typeorm/entities/auth-people.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([People, AuthPeople]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                secret: cfg.get<string> ('JWT_ACCESS_SECRET'),
                singOptions: { expiresIn: cfg.get<string>('JWT_ACCESS_TTL') || '900s' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, AccessTokenStrategy],
    exports: [JwtModule],
})
export class AuthModule {}
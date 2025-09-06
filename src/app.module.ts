import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.validation';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: envSchema, // ⬅️ clave: aquí se activa Joi
        }),
        LoggerModule.forRoot({
            pinoHttp: { transport: { target: 'pino-pretty' } },
        }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.POSTGRES_HOST,
            port: parseInt(process.env.POSTGRES_PORT!, 10),
            username: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: process.env.POSTGRES_DB,
            autoLoadEntities: true,
            synchronize: false,
            migrationsRun: false,
            migrations: ['dist/migrations/*.js'],
            logging: ['schema', 'error', 'warn', 'info', 'log', 'migration', 'query'],
        }),
    ],
})
export class AppModule {}

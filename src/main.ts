import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    const config = app.get(ConfigService);
    await app.listen(config.get<number>('APP_PORT') || 3000);
}
bootstrap();

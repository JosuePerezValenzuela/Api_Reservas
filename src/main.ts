import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // quita propiedades no declaradas en DTOs
            forbidNonWhitelisted: true, // si viene “basura”, lanza 400
            transform: true, // castea (string→number, etc.)
            transformOptions: { enableImplicitConversion: true },
        })
    );

    app.enableCors({ origin: true, credentials: true });

    const config = new DocumentBuilder()
        .setTitle('UMSS Reservas API')
        .setDescription('API de reservas de ambientes')
        .setVersion('0.1.0')
        .addBearerAuth() // uso JWT
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    // http://localhost:3000/docs

    const cfg = app.get(ConfigService);
    const port = cfg.get<number>('APP_PORT') ?? 3000;
    await app.listen(port);

    console.log(`API ready on http://localhost:${port}`);
    console.log(`Swagger on http://localhost:${port}/docs`);
}
bootstrap();

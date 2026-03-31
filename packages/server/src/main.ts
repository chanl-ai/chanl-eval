import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors();

  // Global prefix — matches chanl-platform for seamless cloud migration
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('chanl-eval API')
    .setDescription('AI agent testing and evaluation engine')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 18005;
  await app.listen(port);
  logger.log(`chanl-eval server running on port ${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  if (process.env.CHANL_EVAL_REQUIRE_API_KEY !== 'true') {
    logger.warn(
      'X-API-Key not required (set CHANL_EVAL_REQUIRE_API_KEY=true to enforce in shared or production environments)',
    );
  }
}

bootstrap();

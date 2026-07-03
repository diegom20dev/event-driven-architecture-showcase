import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './matches/infrastructure/http/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate DTOs at the HTTP boundary.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.setGlobalPrefix('/api');

  // Map domain errors → HTTP (the domain has no knowledge of NestJS).
  app.useGlobalFilters(new DomainExceptionFilter());

  // Swagger / OpenAPI at /docs.
  const config = new DocumentBuilder()
    .setTitle('Match Engine')
    .setDescription('Turn-based match engine (state machine + async events).')
    .setVersion('1.0')
    .addTag('matches')
    .addTag('health')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

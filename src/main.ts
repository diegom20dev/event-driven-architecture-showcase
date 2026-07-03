import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './matches/infrastructure/http/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación de DTOs en la frontera HTTP.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.setGlobalPrefix('/api');

  // Errores de dominio → HTTP (el dominio no conoce NestJS).
  app.useGlobalFilters(new DomainExceptionFilter());

  // Swagger / OpenAPI en /docs.
  const config = new DocumentBuilder()
    .setTitle('Match Engine')
    .setDescription('Motor de partidas por turnos (máquina de estados + eventos). Fase 1.')
    .setVersion('1.0')
    .addTag('matches')
    .addTag('health')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

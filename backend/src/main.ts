import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3400',
  });
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api', { exclude: ['health'] });

  // Swagger — only in non-production
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DocMind')
      .setVersion('0.1')
      .addTag('api')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 4000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
}
bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});

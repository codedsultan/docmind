// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // ✅ Debug: Check if DATABASE_URL is loaded
  console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('🔍 API_PREFIX:', process.env.API_PREFIX);
  console.log('🔍 PORT:', process.env.PORT);

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api', { exclude: ['health'] });
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}
bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

// Titik Masuk Utama (Entry Point) Aplikasi Backend Ledgery
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set payload size limit for batch requests (e.g. depreciation run with 500+ items)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Mengaktifkan CORS agar dapat diakses dari Frontend React (Port 3000 / Vite)
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Mengaktifkan Global Validation Pipe untuk memvalidasi DTO pada setiap endpoint
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend Engine Ledgery SaaS berjalan di http://localhost:${port}`);
}

bootstrap();

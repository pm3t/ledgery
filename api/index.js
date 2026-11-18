require('reflect-metadata');
// Explicit requires so Vercel Node File Tracer (@vercel/nft) bundles all NestJS + Prisma runtime dependencies
require('@nestjs/core');
require('@nestjs/common');
require('@nestjs/config');
require('@nestjs/event-emitter');
require('@nestjs/jwt');
require('@nestjs/passport');
require('@nestjs/platform-express');
require('@prisma/client');
require('bcrypt');
require('class-transformer');
require('class-validator');
require('passport');
require('passport-jwt');
require('rxjs');
require('xlsx');
require('pdf-lib');
require('qrcode');
require('bwip-js');

const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');

let cachedServer = null;

async function bootstrapServer() {
  if (!cachedServer) {
    // Cari path app.module.js secara andal di lingkungan Vercel Lambda
    const possiblePaths = [
      path.join(__dirname, '../backend/dist/app.module.js'),
      path.join(__dirname, '../backend/dist/src/app.module.js'),
      path.join(process.cwd(), 'backend/dist/app.module.js'),
      path.join(process.cwd(), 'backend/dist/src/app.module.js'),
    ];

    let appModulePath = possiblePaths.find((p) => fs.existsSync(p));
    if (!appModulePath) {
      // Fallback require string relative
      appModulePath = fs.existsSync(path.join(__dirname, '../backend/dist/app.module.js'))
        ? '../backend/dist/app.module'
        : '../backend/dist/src/app.module';
    }

    const { AppModule } = require(appModulePath);
    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

    app.enableCors({
      origin: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );

    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }
  return cachedServer;
}

module.exports = async (req, res) => {
  try {
    if (req.url && req.url.startsWith('/api')) {
      req.url = req.url.replace(/^\/api/, '') || '/';
    }

    // Endpoint diagnostik & health check untuk memverifikasi kesiapan lingkungan Vercel
    if (req.url === '/health' || req.url === '/health/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          node: process.version,
          env: {
            hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
            databaseUrlPrefix: process.env.DATABASE_URL
              ? process.env.DATABASE_URL.split('@')[1] || 'configured'
              : 'NOT_CONFIGURED',
            hasJwtSecret: Boolean(process.env.JWT_SECRET),
            nodeEnv: process.env.NODE_ENV || 'production',
          },
        }),
      );
    }

    // Validasi keberadaan DATABASE_URL sebelum inisialisasi agar memberikan pesan yang jelas
    if (!process.env.DATABASE_URL) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          statusCode: 500,
          error: 'DATABASE_URL_MISSING',
          message:
            'Environment variable DATABASE_URL belum diatur di Vercel Dashboard (Project Settings -> Environment Variables). Silakan tambahkan connection string PostgreSQL Anda.',
        }),
      );
    }

    const server = await bootstrapServer();
    return server(req, res);
  } catch (err) {
    console.error('Ledgery API execution error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        statusCode: 500,
        error: 'API_INITIALIZATION_ERROR',
        message: err.message || 'Internal Server Error pada Backend Ledgery',
        detail: String(err),
      }),
    );
  }
};

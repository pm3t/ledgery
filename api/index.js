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

const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const appModulePath = fs.existsSync(path.join(__dirname, '../backend/dist/app.module.js'))
  ? '../backend/dist/app.module'
  : '../backend/dist/src/app.module';
const { AppModule } = require(appModulePath);

let cachedServer = null;

async function bootstrapServer() {
  if (!cachedServer) {
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
    const server = await bootstrapServer();
    return server(req, res);
  } catch (err) {
    console.error('Ledgery API error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: err.message || 'Internal Server Error' }));
  }
};

const path = require('path');
const Module = require('module');

// Pastikan resolusi module mencakup backend/node_modules baik untuk file ini maupun seluruh child modules
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${backendNodeModules}${path.delimiter}${process.env.NODE_PATH}`
  : backendNodeModules;
Module._initPaths();
if (!module.paths.includes(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../backend/dist/src/app.module');

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

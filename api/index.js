const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../backend/dist/app.module');

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
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }
  const server = await bootstrapServer();
  return server(req, res);
};


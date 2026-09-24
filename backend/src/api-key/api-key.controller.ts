import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { GenerateApiKeyDto } from './dto/generate-api-key.dto';

// Controller untuk Manajemen API Key Tenant
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  // POST /api-keys/generate — Membuat API Key baru per tenant
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateKey(@Body() generateApiKeyDto: GenerateApiKeyDto) {
    const result = await this.apiKeyService.generateKey(generateApiKeyDto);
    return {
      statusCode: HttpStatus.CREATED,
      message:
        'API Key berhasil dibuat. Simpan API Key ini di tempat aman karena tidak akan ditampilkan lagi!',
      data: result,
    };
  }

  // GET /api-keys/tenant/:tenantId — Daftar API Key per tenant
  @Get('tenant/:tenantId')
  async findByTenant(@Param('tenantId') tenantId: string) {
    const apiKeys = await this.apiKeyService.findByTenant(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar API Key berhasil diambil',
      data: apiKeys,
    };
  }

  // PATCH /api-keys/:id/revoke — Nonaktifkan (revoke) API Key
  @Patch(':id/revoke')
  async revokeKey(@Param('id') id: string) {
    const revokedKey = await this.apiKeyService.revokeKey(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'API Key berhasil ditarik (revoked)',
      data: revokedKey,
    };
  }

  // DELETE /api-keys/:id — Hapus API Key permanen
  @Delete(':id')
  async removeKey(@Param('id') id: string) {
    await this.apiKeyService.removeKey(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'API Key berhasil dihapus permanen',
    };
  }
}

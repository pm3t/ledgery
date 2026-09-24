import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  HttpStatus,
} from '@nestjs/common';
import { SettingService } from './setting.service';
import { UpdatePostingPolicyDto } from './dto/update-posting-policy.dto';

// Controller untuk Pengaturan Tenant (Posting Policy)
@Controller('settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  // GET /settings/posting-policy/:tenantId — Mendapatkan setting kebijakan posting
  @Get('posting-policy/:tenantId')
  async getPostingPolicy(@Param('tenantId') tenantId: string) {
    const policy = await this.settingService.getPostingPolicy(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Kebijakan posting berhasil diambil',
      data: policy,
    };
  }

  // PUT /settings/posting-policy/:tenantId — Mengubah setting kebijakan posting
  @Put('posting-policy/:tenantId')
  async updatePostingPolicy(
    @Param('tenantId') tenantId: string,
    @Body() updatePostingPolicyDto: UpdatePostingPolicyDto,
  ) {
    const updated = await this.settingService.updatePostingPolicy(
      tenantId,
      updatePostingPolicyDto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Kebijakan posting berhasil diperbarui',
      data: updated,
    };
  }
}

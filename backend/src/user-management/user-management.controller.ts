import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserManagementController {
  constructor(private readonly userService: UserManagementService) {}

  // GET /users — List user (filter tergantung role pemanggil)
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN_TENANT')
  async getUsers(
    @Req() req: any,
    @Query('tenantId') filterTenantId?: string,
  ) {
    const { role, tenantId } = req.user;
    const users = await this.userService.getUsers(role, tenantId, filterTenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar user berhasil diambil',
      data: users,
    };
  }

  // POST /users — Buat user baru
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN_TENANT')
  async createUser(@Req() req: any, @Body() body: any) {
    const { role, tenantId } = req.user;
    const user = await this.userService.createUser(role, tenantId, body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'User berhasil dibuat',
      data: user,
    };
  }

  // PUT /users/:id — Edit user
  @Put(':id')
  @Roles('SUPER_ADMIN', 'ADMIN_TENANT')
  async updateUser(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const { role, tenantId } = req.user;
    const user = await this.userService.updateUser(role, tenantId, id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'User berhasil diperbarui',
      data: user,
    };
  }

  // DELETE /users/:id — Nonaktifkan user
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN_TENANT')
  async deactivateUser(@Req() req: any, @Param('id') id: string) {
    const { role, tenantId } = req.user;
    const result = await this.userService.deactivateUser(role, tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'User berhasil dinonaktifkan',
      data: result,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard yang memverifikasi JWT token dari header Authorization: Bearer <token>
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
